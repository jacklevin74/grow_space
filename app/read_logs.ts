import {workspace, web3, AnchorProvider, setProvider,} from "@coral-xyz/anchor";
import type {Program} from "@coral-xyz/anchor";
import {GrowSpace} from "../target/types/grow_space";

async function main() {

    const provider = AnchorProvider.env();
    setProvider(provider);
    const connection = provider.connection;

    const program = workspace.GrowSpace as Program<GrowSpace>;

    let transactionList = await connection.getSignaturesForAddress(
        program.programId,
        {limit: 10},
        'confirmed'
    );

    let signatureList = transactionList.map(transaction => transaction.signature);
    let transactionDetails = await connection.getParsedTransactions(signatureList, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
    });

    transactionDetails.forEach((transaction, i) => {
        const date = new Date(transaction.blockTime * 1000);
        console.log(`Transaction No: ${i + 1}`);
        console.log(`Messages:`);
        transaction.meta.logMessages.forEach(console.log)
    })
}

main().catch(console.log)