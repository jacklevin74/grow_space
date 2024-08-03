const express = require('express');
const bodyParser = require('body-parser');
const anchor = require('@coral-xyz/anchor');
const { Keypair, PublicKey, Connection, clusterApiUrl } = require('@solana/web3.js');
const { Program } = require('@coral-xyz/anchor');
const { GrowSpace } = require('../target/types/grow_space.js');
const { assert } = require('chai');
const { BN } = require('bn.js');

const app = express();
app.use(bodyParser.json());

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.GrowSpace;

// Function to check if a PDA account already exists
async function pdaExists(pda) {
  const accountInfo = await provider.connection.getAccountInfo(pda);
  return accountInfo !== null;
}

// Endpoint to append data and initialize PDA if needed
app.post('/append_data', async (req, res) => {
  const { block_id, final_hash, pubkey } = req.body;
  const uniqueId = new BN(block_id);
  const pubkeyObj = new PublicKey(pubkey);

  const [pda, bump] = await PublicKey.findProgramAddress(
    [Buffer.from("pda_account"), uniqueId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  try {
    // Check if the PDA already exists
    const exists = await pdaExists(pda);
    if (!exists) {
      // Initialize the PDA if it does not exist
      try {
        await program.methods.initializePda(uniqueId).accounts({
            pdaAccount: pda,
            payer: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([provider.wallet.payer])
          .rpc();
        console.log("Initialized PDA account public key:", pda.toString(), "with bump:", bump);
      } catch (err) {
        throw new Error(`Failed to initialize PDA: ${err.message}`);
      }
    } else {
      console.log("PDA already initialized, proceeding to append data.");
    }

    // Append the data
    await program.methods.appendData(uniqueId, final_hash, pubkeyObj).accounts({
        pdaAccount: pda,
        payer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([provider.wallet.payer])
      .rpc();
    res.status(200).json({ message: "Appended data", pda: pda.toString() });
  } catch (err) {
    res.status(500).json({ error: "Failed to append data", details: err.toString() });
  }
});

// Endpoint to fetch and display data
app.get('/fetch_data/:block_id', async (req, res) => {
  const block_id = parseInt(req.params.block_id);
  const uniqueId = new BN(block_id);

  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from("pda_account"), uniqueId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  try {
    const account = await program.account.pdaAccount.fetch(pda);

    const blockInfo = {
      blockId: block_id,
      entries: account.blockIds.map(entry => ({
        blockId: entry.blockId.toString(),
        finalHashes: entry.finalHashes.map(hashEntry => ({
          finalHash: hashEntry.finalHash,
	  count: parseInt(hashEntry.count, 10),
          pubkeys: hashEntry.pubkeys.map(pubkey => pubkey.toString())
        }))
      }))
    };

    res.status(200).json(blockInfo);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch data", details: err.toString() });
  }
});

const PORT = 5555;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

