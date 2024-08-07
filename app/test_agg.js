const anchor = require('@coral-xyz/anchor');
const { PublicKey, Transaction } = require('@solana/web3.js');
const { BN } = require('bn.js');
const { ComputeBudgetProgram } = require('@solana/web3.js');

// Get input from command line arguments
const block_id = parseInt(process.argv[2]);

if (isNaN(block_id)) {
  console.error('Please provide a valid block_id.');
  process.exit(1);
}

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.GrowSpace;

async function aggregatePubkeyCounts(blockId) {
  const uniqueId = new BN(blockId - 100);

  const uniqueIdBuffer = Buffer.alloc(8);
  uniqueIdBuffer.writeBigUInt64LE(BigInt(uniqueId.toString()));

  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from("pda_account"), uniqueId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  const [voterAccountingPda] = await PublicKey.findProgramAddress(
    [Buffer.from("accounting")],
    program.programId
  );

  try {
    console.log(`Fetching data for block_id: ${block_id}, PDA: ${pda.toString()}`);
    const pdaAccount = await program.account.pdaAccount.fetch(pda);
    console.log("PDA Account Data:", pdaAccount);

    const transaction = new Transaction();

    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 1400000,
      })
    );

    transaction.add(
      await program.methods.aggregatePubkeyCounts(uniqueId).accounts({
        pdaAccount: pda,
        voterAccounting: voterAccountingPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).instruction()
    );

    console.log(`Sending transaction for block ID: ${blockId}`);
    const txId = await provider.sendAndConfirm(transaction);
    console.log(`Transaction sent with ID: ${txId}`);

    console.log(`Fetching voter accounting data for PDA: ${voterAccountingPda.toString()}`);
    const voterAccounting = await program.account.voterAccounting.fetch(voterAccountingPda);
    console.log("Fetched Voter Accounting Data:", voterAccounting);

    voterAccounting.pubkeyCounts.forEach((entry, index) => {
      console.log(`Record ${index + 1}: Pubkey = ${entry[0]}, Credit = ${entry[1]}, Debit = ${entry[2]}`);
    });

  } catch (err) {
    console.error(`Failed to aggregate pubkey counts for block ID: ${blockId}`, err);
  }
}

aggregatePubkeyCounts(block_id);

