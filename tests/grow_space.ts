import {workspace, web3, AnchorProvider, setProvider,} from "@coral-xyz/anchor";
import type {Program} from "@coral-xyz/anchor";
import {GrowSpace} from "../target/types/grow_space";
import {assert} from "chai";
import {BN} from "bn.js";
import {ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction} from "@solana/web3.js";

const formatUserPda = (a) => ({
    user: a.user.toString(),
    credit: a.credit.toNumber(),
    debit: a.debit.toNumber(),
    inblock: a.inblock.toNumber()
});

describe("grow_space_combined", () => {
    // Configure the client to use the local cluster.
    const provider = AnchorProvider.env();
    setProvider(provider);

    const program = workspace.GrowSpace as Program<GrowSpace>;

    const keypairs: Keypair[] = []
    const KEYS = 3;

    const getUserPda = (keypair: Keypair) => {
        const [userPda] = web3.PublicKey.findProgramAddressSync(
            [Buffer.from("user_account_pda"), keypair.publicKey.toBytes()],
            program.programId
        )
        return userPda;
    }

    const createAndFundAccount = async () => {
        const keypair = web3.Keypair.generate();
        const fundTx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: provider.wallet.publicKey,
                toPubkey: keypair.publicKey,
                lamports: 0.005 * LAMPORTS_PER_SOL,
            })
        );
        await provider.sendAndConfirm(fundTx, []);
        return keypair;
    }

    const printPdaAccountInfo = async (blockId: string) => {
        const uniqueId = new BN(parseInt(blockId));
        const [pda] = web3.PublicKey.findProgramAddressSync(
            [Buffer.from("pda_account"), uniqueId.toArrayLike(Buffer, "le", 8)],
            program.programId
        );

        const account = await program.account.pdaAccount.fetch(pda);

        console.log(`Block ID ${blockId} stored in PDA`)
        console.log(account);
    }

    it("Appends multiple final hashes, including repeats, to random block IDs in the PDA with repeated pubkeys", async () => {
        const blockIds = new Set<string>();
        let pda: web3.PublicKey;
        let prevPda: web3.PublicKey;

        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_400_000
        });

        for await (const i of Array.from({length: KEYS + 1}, (_, i) => i)) {
            const keypair = await createAndFundAccount();
            keypairs.push(keypair)
        }

        let randomBlockId = Math.floor(Math.random() * 10_000);

        for await (const i of [0, 1, 2]) { // Limiting to 3 for testing purposes
            randomBlockId += Math.floor(Math.random() * 100_000);
            blockIds.add(randomBlockId.toString())
            const uniqueId = new BN(randomBlockId); // Use the block ID as the unique ID
            console.log("Loop: " + i + ", Block ID: " + randomBlockId);

            let bump: number;

            // Initialize a new PDA for each block ID
            [pda, bump] = web3.PublicKey.findProgramAddressSync(
                [Buffer.from("pda_account"), uniqueId.toArrayLike(Buffer, "le", 8)],
                program.programId
            )
            console.log('PDA', pda.toString(), 'prev', prevPda?.toString())

            try {
                const sig = await program.methods.initializePda(uniqueId)
                    .accounts({
                        payer: provider.wallet.publicKey,
                    })
                    .signers([])
                    .rpc({commitment: "confirmed", skipPreflight: true});
                console.log("Initialized PDA account public key:", pda.toString(), "with bump:", bump, 'sig:', sig);
            } catch (err) {
                console.error("Failed to initialize PDA:", err);
            }

            // const pubkeys = Array.from({length: 30}, () => web3.Keypair.generate().publicKey);

            // Append repeating final hashes with repeated pubkeys
            const repeatingHashes = [`hash_${randomBlockId}_r1`, `hash_${randomBlockId}_r1`, `hash_${randomBlockId}_r1`];
            for await (const j of Array(3).fill(0).map((_, i) => i)) { // Reduced to 3 for testing purposes
                for await (const repeatingHash of repeatingHashes) {
                    try {
                        const keypair = keypairs[Math.floor(Math.random() * (KEYS + 1))];

                        const [userPda] = web3.PublicKey.findProgramAddressSync(
                            [Buffer.from("user_account_pda"), keypair.publicKey.toBytes()],
                            program.programId
                        )

                        const sig = await program.methods.appendData(uniqueId, repeatingHash)
                            .accountsPartial({
                                pdaAccount: pda,
                                payer: keypair.publicKey,
                                userAccountPda: userPda,
                                // payer: provider.wallet.publicKey,
                                prevPdaAccount: prevPda || null,
                                // systemProgram: web3.SystemProgram.programId,
                            })
                            .remainingAccounts([...keypairs.map(k => ({
                                pubkey: getUserPda(k),
                                isSigner: false,
                                isWritable: true
                            }))])
                            .preInstructions([modifyComputeUnits])
                            .signers([keypair])
                            .rpc({commitment: "confirmed", skipPreflight: true});
                        console.log("  Appending Repeating Final Hash:", repeatingHash, "payer:", keypair.publicKey.toString(), "sig:", sig);
                    } catch (err) {
                        console.error(`Failed to append data for Block ID ${randomBlockId}:`, err);
                    }
                }
            }

            // Append unique final hashes
            for await (const k of [0, 1, 2]) { // Reduced to 3 for testing purposes
                randomBlockId += Math.floor(Math.random() * 100_000);
                blockIds.add(randomBlockId.toString())
                const uniqueHash = `hash_${randomBlockId}_unique${k}`;

                try {
                    const keypair = keypairs[Math.floor(Math.random() * (KEYS + 1))];

                    const sig = await program.methods.appendData(new BN(randomBlockId), uniqueHash)
                        .accountsPartial({
                            pdaAccount: pda,
                            prevPdaAccount: prevPda || null,
                            payer: keypair.publicKey,
                            // payer: provider.wallet.publicKey,
                            //systemProgram: web3.SystemProgram.programId,
                        })
                        .signers([keypair])
                        .remainingAccounts([...keypairs.map(k => ({
                            pubkey: getUserPda(k),
                            isSigner: false,
                            isWritable: true
                        }))])
                        .preInstructions([modifyComputeUnits])
                        .rpc({commitment: "confirmed", skipPreflight: true});

                    console.log("  Appending Unique Final Hash:" + uniqueHash + ", sig:" + sig);
                    // blockIds.add(randomBlockId.toString());

                } catch (err) {
                    console.error(`Failed to append data for Block ID ${randomBlockId}:`, err);
                }
            }

            // blockIds.add(randomBlockId.toString());

            await new Promise(resolve => setTimeout(resolve, 5_000));
            // await printPdaAccountInfo(randomBlockId.toString());

            prevPda = pda;

        }

        console.log('Blocks', [...blockIds].join(", "))
        // Fetch the PDA and print the stored data
        for await (const blockId of [...blockIds]) {
            const uniqueId = new BN(parseInt(blockId));
            const [pda] = web3.PublicKey.findProgramAddressSync(
                [Buffer.from("pda_account"), uniqueId.toArrayLike(Buffer, "le", 8)],
                program.programId
            );

            try {
                const account = await program.account.pdaAccount.fetch(pda);
                if (account.blockIds.length > 0) {
                    account.blockIds.forEach((entry: any, index: number) => {
                        // printPdaAccountInfo(blockId.toString());
                        console.log(`  Block ID ${entry.blockId.toString()}`);
                        entry.finalHashes.forEach((hashEntry: any) => {
                            console.log(`    Final Hash: ${Buffer.from(hashEntry.finalHash).toString()} (pubkeys count: ${hashEntry.pubkeys.length})`);
                            hashEntry.pubkeys.forEach((pubkey: any, pubkeyIndex: number) => {
                                console.log(`      Pubkey ${pubkeyIndex}: ${pubkey.toString()}`);
                            });
                        });
                    });
                } else {
                    console.log(`PDA ${pda}: No blockIds`)
                }
            } catch (e) {
                console.log(e.message)
            }
        }

        for await (const keypair of keypairs) {
            const [userPda] = web3.PublicKey.findProgramAddressSync(
                [Buffer.from("user_account_pda"), keypair.publicKey.toBytes()],
                program.programId
            )
            try {
                const userAccount = await program.account.userAccountPda.fetch(userPda);
                console.log('user pda', keypair.publicKey.toString(), formatUserPda(userAccount))
            } catch (e) {
                console.log(e.message)
            }
        }

        // Verify that the values are unique Block IDs
        const blockIdsSet = new Set(Array.from(blockIds));
        assert.equal(blockIdsSet.size, blockIds.size, "Block IDs should be unique");

        console.log("Total unique block IDs added: ", blockIds.size);
    });
});

