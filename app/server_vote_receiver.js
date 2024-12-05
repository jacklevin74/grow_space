const express = require('express');
const bodyParser = require('body-parser');
const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');
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
app.post('/', async (req, res) => {
  const { first_block_id, final_hash, pubkey } = req.body;
  console.log(req.body);
  const block_id = first_block_id;
  console.log(block_id + " " + pubkey + "\n");

  const uniqueId = new BN(block_id);
  const pubkeyObj = new PublicKey(pubkey);
        
  // define prev block_id
  const prevuniqueId = new BN(block_id - 100);

 const [prev_pda, prev_bump] = await PublicKey.findProgramAddress(
    [Buffer.from("pda_account"), prevuniqueId.toArrayLike(Buffer, "le", 8)],
    program.programId
 );

  // Derive the PDA for the main account
  const [pda, bump] = await PublicKey.findProgramAddress(
    [Buffer.from("pda_account"), uniqueId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  // Derive the PDA for the user account
  const [user_account_pda, user_account_pda_bump] = await PublicKey.findProgramAddress(
    [Buffer.from("user_account_pda"), pubkeyObj.toBuffer()],
    program.programId
  );

  try {
    // Check if the pda_account already exists
    const pdaExistsFlag = await pdaExists(pda);

    if (!pdaExistsFlag) {
      // Initialize the pda_account if it does not exist
      try {
        const tx = await program.methods.initializePda(uniqueId, pubkeyObj).accounts({
            pdaAccount: pda,
            payer: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([provider.wallet.payer])
          .rpc();
        console.log("Initialization transaction hash:", tx);
        console.log("Initialized PDA account public key:", pda.toString(), "with bump:", bump);
        console.log("Initialized PDA for user:", user_account_pda.toString());
      } catch (err) {
        throw new Error(`Failed to initialize PDA: ${err.message}`);
      }
    } else {
      console.log("PDA already initialized, proceeding to append data.");
    }

    try {
      console.log("Attempting to append data...");

      // Append the data
      const tx2 = await program.methods.appendData(uniqueId, final_hash, pubkeyObj).accounts({
          pdaAccount: pda,
	  prevPdaAccount: prev_pda,
          userAccountPda: user_account_pda, // Uses init_if_needed so no explicit initialization required
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([provider.wallet.payer])
        .rpc();

      console.log("Transaction successful, transaction hash:", tx2);
      res.status(200).json({ message: "Appended data", pda: pda.toString(), txHash: tx2 });

    } catch (err) {
      console.error("Failed to append data, error details:", err);
      res.status(500).json({ error: "Failed to append data", details: err.toString() });
    }

  } catch (err) {
    console.error("Failed to process request, error details:", err);
    res.status(500).json({ error: "Failed to process request", details: err.toString() });
  }
});

// Endpoint to fetch and display data
app.get('/fetch_data/:block_id', async (req, res) => {
  const block_id = parseInt(req.params.block_id);
  if (isNaN(block_id)) {
    return res.status(400).json({ error: "Invalid block_id" });
  }

  const uniqueId = new BN(block_id);

  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from("pda_account"), uniqueId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  try {
    console.log(`Fetching data for block_id: ${block_id}, PDA: ${pda.toString()}`);
    const account = await program.account.pdaAccount.fetch(pda);

    const blockInfo = {
      blockId: block_id,
      entries: account.blockIds.map(entry => ({
        blockId: entry.blockId.toString(),
        finalHashes: entry.finalHashes.map(hashEntry => ({
          finalHash: Buffer.from(hashEntry.finalHash).toString('utf8'),  // Convert finalHash bytes to string
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

const PORT = 4444;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

