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

  it("Verifies the PDA is initialized with an empty vector", async () => {
    const account = await program.account.pdaAccount.fetch(pda);
    assert.deepEqual(account.entries, []);
  });

  it("Appends random Pubkeys to the PDA and initializes their PubkeyValues accounts", async () => {
    const pubkeys = new Set();

    for (let i = 1; i <= 5; i++) {
      const randomPubkey = anchor.web3.Keypair.generate().publicKey;
      console.log("Loop: " + i + ", Pubkey: " + randomPubkey.toString());

      await program.methods.appendPubkey(randomPubkey).accounts({
          pdaAccount: pda,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([provider.wallet.payer])
        .rpc();

      pubkeys.add(randomPubkey.toString());

      const [pubkeyValuesAccount, _bump] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("pubkey_values"), randomPubkey.toBuffer()],
        program.programId
      );

      try {
        await program.methods.initializePubkeyValues(randomPubkey).accounts({
            pubkeyValuesAccount,
            payer: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([provider.wallet.payer])
          .rpc();
      } catch (err) {
        console.error(`Failed to initialize PubkeyValues for ${randomPubkey.toString()}:`, err);
      }
    }

    const account = await program.account.pdaAccount.fetch(pda);

    // Print and count the Pubkeys
    console.log("Pubkeys stored in the PDA:");
    account.entries.forEach((entry: any, index: number) => {
      console.log(`Index ${index}: ${entry.pubkey.toString()}`);
    });

    // Verify that the values are unique Pubkeys
    const pubkeysSet = new Set(account.entries.map((entry: any) => entry.pubkey.toString()));
    assert.equal(pubkeysSet.size, account.entries.length, "Pubkeys should be unique");

    console.log("Total unique pubkeys added: ", account.entries.length);
  });

  it("Appends values to each Pubkey and reallocates if necessary", async () => {
    const account = await program.account.pdaAccount.fetch(pda);

    for (const entry of account.entries) {
      const [pubkeyValuesAccount, _bump] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("pubkey_values"), entry.pubkey.toBuffer()],
        program.programId
      );

      for (let j = 1; j <= 5; j++) {
        await program.methods.appendValue(entry.pubkey, new BN(j)).accounts({
            pubkeyValuesAccount,
            payer: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([provider.wallet.payer])
          .rpc();
      }
    }

    for (const entry of account.entries) {
      const [pubkeyValuesAccount, _bump] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("pubkey_values"), entry.pubkey.toBuffer()],
        program.programId
      );
      const pubkeyValues = await program.account.pubkeyValues.fetch(pubkeyValuesAccount);

      // Print the Pubkeys and their associated values
      console.log(`Pubkey: ${entry.pubkey.toString()}`);
      pubkeyValues.values.forEach((value: BN, valueIndex: number) => {
        console.log(`  Value ${valueIndex}: ${value.toString()}`);
      });

      // Verify that each Pubkey has the correct number of values
      assert.equal(pubkeyValues.values.length, 5, "Each Pubkey should have 5 values");
    }
  });
});

