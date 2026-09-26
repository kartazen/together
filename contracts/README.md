# contracts — GroupCheckout on Monad testnet

Spec: `../docs/CONTRACT.md` · events: `../docs/INTERFACES.md`

## Setup (once)
```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
cd contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
forge test
```

## 1. Create a dev wallet (encrypted, the private key is never printed)
```bash
cast wallet new ~/.foundry/keystores deployer     # asks for a password, prints the address
cast wallet address --account deployer            # show it again later
```
Testnet only. Never send real funds to this wallet.

## 2. Fund it with testnet MON (gas)
Faucet: the official one linked from https://docs.monad.xyz (Monad testnet faucet) — paste the deployer address. The deploy costs ~0.3 MON.
```bash
cast balance --ether --rpc-url monad_testnet $(cast wallet address --account deployer)
```

## 3. Deploy
```bash
forge script script/Deploy.s.sol --rpc-url monad_testnet --account deployer --broadcast
```
Prints the `USDC` (MockUSDC) and `GroupCheckout` addresses. Set `USDC=0x…` to reuse an existing token.

## 4. Verify on the explorer (optional)
```bash
forge verify-contract <GroupCheckout> src/GroupCheckout.sol:GroupCheckout \
  --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org \
  --constructor-args $(cast abi-encode "constructor(address)" <USDC>)
```

## 5. Give test USDC to the demo phones
```bash
cast send <USDC> "mint(address,uint256)" <PHONE_ADDRESS> 1000000 --rpc-url monad_testnet --account deployer   # 1 USDC
```

## 6. Try the $0.03 checkpoint from the CLI
```bash
T=$(cast keccak "table-12")
cast send <GroupCheckout> "createBill(bytes32,uint256,uint8,uint64)" $T 30000 3 3600 --rpc-url monad_testnet --account deployer
cast call <GroupCheckout> "activeBillOf(bytes32)(uint256)" $T --rpc-url monad_testnet
```
