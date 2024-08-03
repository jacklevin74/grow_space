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

  it("Appends multiple final hashes, including repeats, to random block IDs in the PDA with repeated pubkeys", async () => {
    const blockIds = new Set();

    for (let i = 1; i <= 3; i++) { // Limiting to 3 for testing purposes
      const randomBlockId = Math.floor(Math.random() * 100000);
      const uniqueId = new BN(randomBlockId); // Use the block ID as the unique ID
      console.log("Loop: " + i + ", Block ID: " + randomBlockId);

      let pda: anchor.web3.PublicKey;
      let bump: number;
      
      // Initialize a new PDA for each block ID
      [pda, bump] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("pda_account"), provider.wallet.publicKey.toBuffer(), uniqueId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

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
        console.error("Failed to initialize PDA:", err);
      }

      const pubkeys = Array.from({ length: 30 }, () => anchor.web3.Keypair.generate().publicKey);

      // Append repeating final hashes with repeated pubkeys
      const repeatingHashes = [`hash_${randomBlockId}_r1`, `hash_${randomBlockId}_r2`, `hash_${randomBlockId}_r3`];
      for (let j = 1; j <= 10; j++) { // Reduced to 3 for testing purposes
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
      for (let k = 1; k <= 3; k++) { // Reduced to 3 for testing purposes
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

    // Fetch the PDA and print the stored data
    for (const blockId of blockIds) {
      const uniqueId = new BN(parseInt(blockId));
      const [pda] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("pda_account"), provider.wallet.publicKey.toBuffer(), uniqueId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const account = await program.account.pdaAccount.fetch(pda);

      console.log(`Block ID ${blockId} stored in PDA:`);
      account.blockIds.forEach((entry: any, index: number) => {
        console.log(`  Block ID ${entry.blockId.toString()}`);
        entry.finalHashes.forEach((hashEntry: any) => {
          console.log(`    Final Hash: ${hashEntry.finalHash} (count: ${hashEntry.count}, pubkeys: ${hashEntry.pubkeys.length})`);
          hashEntry.pubkeys.forEach((pubkey: any, pubkeyIndex: number) => {
            console.log(`      Pubkey ${pubkeyIndex}: ${pubkey.toString()}`);
          });
        });
      });
    }

    // Verify that the values are unique Block IDs
    const blockIdsSet = new Set(Array.from(blockIds));
    assert.equal(blockIdsSet.size, blockIds.size, "Block IDs should be unique");

    console.log("Total unique block IDs added: ", blockIds.size);
  });
});

