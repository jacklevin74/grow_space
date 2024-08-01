import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { GrowSpace } from "../target/types/grow_space";
import { assert } from "chai";

describe("grow_space", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.GrowSpace as Program<GrowSpace>;

  let pda: anchor.web3.PublicKey;

  it("Initializes the PDA", async () => {
    [pda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("pda_account")],
      program.programId
    );

    console.log("Initialized PDA account public key:", pda.toString());

    await program.methods.initializePda().accounts({
        pdaAccount: pda,
        payer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([provider.wallet.payer]) // Explicitly include the default wallet as a signer
      .rpc();

    console.log("Initialized PDA account public key:", pda.toString());
  });

  it("Initializes the PDA with an empty vector", async () => {
    const account = await program.account.pdaAccount.fetch(pda);
    assert.deepEqual(account.values, []);
  });

  it("Appends values to the PDA and reallocates if necessary", async () => {
    for (let i = 1; i <= 15; i++) {
      await program.methods.appendValue(new anchor.BN(i))
        .accounts({
          pdaAccount: pda,
        })
        .rpc();
    }

    const account = await program.account.pdaAccount.fetch(pda);
    assert.deepEqual(account.values.map((v: any) => v.toNumber()), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });
});

