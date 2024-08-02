import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { GrowSpace } from "../target/types/grow_space";
import { assert } from "chai";
import { BN } from "bn.js";

describe("grow_space", () => {
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

  it("Verifies the PDA is initialized with an empty vector", async () => {
    const account = await program.account.pdaAccount.fetch(pda);
    assert.deepEqual(account.values, []);
  });

  it("Appends random Pubkeys to the PDA and reallocates if necessary", async () => {
    const pubkeys = new Set();

    for (let i = 1; i <= 75; i++) {
      const randomPubkey = anchor.web3.Keypair.generate().publicKey;
      console.log("Loop: " + i + ", Pubkey: " + randomPubkey.toString());

      await program.methods.appendPubkey(randomPubkey)
        .accounts({
          pdaAccount: pda,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([provider.wallet.payer])
        .rpc();

      pubkeys.add(randomPubkey.toString());
    }

    const account = await program.account.pdaAccount.fetch(pda);

    // Print and count the Pubkeys
    console.log("Pubkeys stored in the PDA:");
    account.values.forEach((pubkey: anchor.web3.PublicKey, index: number) => {
      console.log(`Index ${index}: ${pubkey.toString()}`);
    });

    // Verify that the values are unique Pubkeys
    const pubkeysSet = new Set(account.values.map((v: any) => v.toString()));
    assert.equal(pubkeysSet.size, account.values.length, "Pubkeys should be unique");
    console.log("Total unique pubkeys added: ", account.values.length);
  });
});

