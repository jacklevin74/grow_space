import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { GrowSpace } from "../target/types/grow_space";
import { assert } from "chai";
import { BN } from "bn.js";

describe("grow_space_combined", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.GrowSpace as Program<GrowSpace>;

  let pda: anchor.web3.PublicKey;
  let bump: number;
  const uniqueId = new BN(Date.now()); // Use a unique identifier and convert to BN

  it("Initializes the PDA", async () => {
    [pda, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("pda_account"), provider.wallet.publicKey.toBuffer(), uniqueId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    console.log("Initialized PDA account public key:", pda.toString(), "with bump:", bump);

    try {
      await program.methods.initializePda(uniqueId).accounts({
          pdaAccount: pda,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([provider.wallet.payer]) // Explicitly include the default wallet as a signer
        .rpc();
    } catch (err) {
      console.error("Failed to initialize PDA:", err);
    }
  });

  it("Appends multiple final hashes, including repeats, to random block IDs in the PDA with repeated pubkeys", async () => {
    const blockIds = new Set();

    for (let i = 1; i <= 3; i++) { // Limiting to 2 for testing purposes
      const randomBlockId = Math.floor(Math.random() * 100000);
      console.log("Loop: " + i + ", Block ID: " + randomBlockId);

      const pubkeys = Array.from({ length: 30 }, () => anchor.web3.Keypair.generate().publicKey);

      // Append repeating final hashes with repeated pubkeys
      const repeatingHashes = [`hash_${randomBlockId}_r1`, `hash_${randomBlockId}_r2`, `hash_${randomBlockId}_r3`];
      for (let j = 1; j <= 30; j++) { // Reduced to 3 for testing purposes
        for (const repeatingHash of repeatingHashes) {
          const pubkey = pubkeys[j % pubkeys.length];
          console.log("  Appending Repeating Final Hash: " + repeatingHash + ", Pubkey: " + pubkey.toString());

          try {
            await program.methods.appendData(new BN(randomBlockId), repeatingHash, pubkey).accounts({
                pdaAccount: pda,
                payer: provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
              })
              .signers([provider.wallet.payer])
              .rpc();
          } catch (err) {
            console.error(`Failed to append data for Block ID ${randomBlockId}:`, err);
          }
        }
      }

      // Append unique final hashes
      for (let k = 1; k <= 3; k++) { // Reduced to 2 for testing purposes
        const uniqueHash = `hash_${randomBlockId}_unique${k}`;
        const pubkey = anchor.web3.Keypair.generate().publicKey;
        console.log("  Appending Unique Final Hash: " + uniqueHash + ", Pubkey: " + pubkey.toString());

        try {
          await program.methods.appendData(new BN(randomBlockId), uniqueHash, pubkey).accounts({
              pdaAccount: pda,
              payer: provider.wallet.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([provider.wallet.payer])
            .rpc();
        } catch (err) {
          console.error(`Failed to append data for Block ID ${randomBlockId}:`, err);
        }
      }

      blockIds.add(randomBlockId.toString());
    }

    const account = await program.account.pdaAccount.fetch(pda);

    // Print and count the Block IDs
    console.log("Block IDs stored in the PDA:");
    account.blockIds.forEach((entry: any, index: number) => {
      console.log(`Index ${index}: Block ID ${entry.blockId.toString()}`);
      entry.finalHashes.forEach((hashEntry: any) => {
        console.log(`  Final Hash: ${hashEntry.finalHash} (count: ${hashEntry.count}, pubkeys: ${hashEntry.pubkeys.length})`);
        hashEntry.pubkeys.forEach((pubkey: any, pubkeyIndex: number) => {
          console.log(`    Pubkey ${pubkeyIndex}: ${pubkey.toString()}`);
        });
      });
    });

    // Verify that the values are unique Block IDs
    const blockIdsSet = new Set(account.blockIds.map((entry: any) => entry.blockId.toString()));
    assert.equal(blockIdsSet.size, account.blockIds.length, "Block IDs should be unique");

    console.log("Total unique block IDs added: ", account.blockIds.length);
  });
});

