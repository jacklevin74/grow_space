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

  it("Appends multiple final hashes, including repeats, to random block IDs in the PDA", async () => {
    const blockIds = new Set();

    for (let i = 1; i <= 20; i++) {
      const randomBlockId = Math.floor(Math.random() * 100000);
      console.log("Loop: " + i + ", Block ID: " + randomBlockId);

      // Append repeating final hashes
      const repeatingHashes = [`hash_${randomBlockId}_r1`, `hash_${randomBlockId}_r2`, `hash_${randomBlockId}_r3`];
      for (let j = 1; j <= 30; j++) {
        for (const repeatingHash of repeatingHashes) {
          console.log("  Appending Repeating Final Hash: " + repeatingHash);

          try {
            await program.methods.appendData(new BN(randomBlockId), repeatingHash).accounts({
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
      for (let k = 1; k <= 20; k++) {
        const uniqueHash = `hash_${randomBlockId}_unique${k}`;
        console.log("  Appending Unique Final Hash: " + uniqueHash);

        try {
          await program.methods.appendData(new BN(randomBlockId), uniqueHash).accounts({
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
      console.log(`Index ${index}: Block ID ${entry.blockId.toString()}, Final Hashes: ${entry.finalHashes.map((hashEntry: any) => `${hashEntry.finalHash} (count: ${hashEntry.count})`).join(", ")}`);
    });

    // Verify that the values are unique Block IDs
    const blockIdsSet = new Set(account.blockIds.map((entry: any) => entry.blockId.toString()));
    assert.equal(blockIdsSet.size, account.blockIds.length, "Block IDs should be unique");

    console.log("Total unique block IDs added: ", account.blockIds.length);
  });
});

