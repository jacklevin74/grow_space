import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { GrowSpace } from "../target/types/grow_space";
import { assert } from "chai";

describe("grow_space_combined", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.GrowSpace as Program<GrowSpace>;

  // Static PDA account
  const pda = new anchor.web3.PublicKey("69E5vfTiBshW7R28t3ber33wfBHyAbubTvXL3iPWsfcz");

  it("Fetches and displays data from the static PDA", async () => {
    try {
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
    } catch (err) {
      console.error("Failed to fetch data from the PDA:", err);
    }
  });
});

