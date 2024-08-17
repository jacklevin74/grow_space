# XEN Blocks Voting Program

## Installation

### JS Modules

```npm i```

### Rust Modules

```anchor build```

#### After First Time Build

1. Run `anchor keys list`
2. Copy program ID
3. Replace Program ID in `./programs/grow_space/src/lib.rs` with the copied string
4. Run `anchor build` again or proceed with tests

## Configuration

This project requires configured connection to Xolana network and a funded main wallet.

Config is set in `Anchor.toml` file.

## Funding Xolana wallet

```solana airdrop 2```

Note: airdrop faucet is rate-limited to prevent abuse.

## Running tests

```anchor test```

This is a long-running integration test which creates N worker wallets, fund them from the main wallet, and then
repeatedly attempts to invoke Program Instruction to append voting data for the current block, as well as reward winning
voters for the previous block.

After the tests are complete, the script prints out stats info about block-voting PDAs and user accounting PDAs.
