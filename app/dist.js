const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');
const { BN } = require('bn.js');

// Get input from command line arguments
const block_id = parseInt(process.argv[2]);

if (isNaN(block_id)) {
  console.error('Please provide a valid block_id.');
  process.exit(1);
}

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.GrowSpace;

async function distributeSolToBlock(block_id) {
  const uniqueId = new BN(block_id);

  const [pda, bump] = await PublicKey.findProgramAddress(
    [Buffer.from("pda_account"), uniqueId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  const [distributionPda] = await PublicKey.findProgramAddress(
    [Buffer.from("distribution_account")],
    program.programId
  );

  try {
    // Distribute SOL to all pubkeys associated with the block_id
    const txHash = await program.methods.distributeSol(uniqueId).accounts({
        pdaAccount: pda,
        distributionAccount: distributionPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).rpc();

    console.log(`Distributed SOL. Transaction hash: ${txHash}`);
  } catch (err) {
    console.error("Failed to distribute SOL", err);
  }
}

// Run the distributeSolToBlock function with the provided block_id
distributeSolToBlock(block_id);

