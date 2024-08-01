import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { GrowSpace } from "../target/types/grow_space";
import { assert } from "chai";

describe("grow_space", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.GrowSpace as Program<GrowSpace>;

  it("Creates a PDA with initial values", async () => {
    const [pda, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("pda_account")],
      program.programId
    );

    await program.methods.createPda([new anchor.BN(1), new anchor.BN(2), new anchor.BN(3)])
      .accounts({
        pdaAccount: pda,
        payer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([provider.wallet.payer])
      .rpc();

    const account = await program.account.pdaAccount.fetch(pda);
    assert.deepEqual(account.values.map((v: any) => v.toNumber()), [1, 2, 3]);
  });

  it("Appends values to the PDA and reallocates if necessary", async () => {
    const [pda, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("pda_account")],
      program.programId
    );

    for (let i = 4; i <= 15; i++) {
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

