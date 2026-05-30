# OPN Invoicer ⚡

> On-chain invoice creation & payment tracking built on **OPN Chain** (Chain ID: 984)
> Submitted for **IOPn Builder Season 6 — Open Track**

---

## What it does

OPN Invoicer lets freelancers and businesses create invoices on-chain and receive payments directly to their wallet — no banks, no middlemen, instant settlement.

| Feature | Detail |
|---|---|
| Create invoices | Store invoice metadata permanently on OPN Chain |
| Pay on-chain | Clients pay in OPN; funds hit creator wallet instantly |
| Platform fee | 0.5% (adjustable by owner, capped at 5%) |
| Overdue tracking | Anyone can flag an invoice past its due date |
| Cancel | Creator can cancel unpaid invoices |
| Query | Full read functions for dashboards and frontends |

---

## Smart Contract

**Network:** OPN Chain Testnet
**Chain ID:** 984
**RPC:** `https://testnet-rpc.iopn.tech`
**Explorer:** `https://testnet.iopn.tech`
**Gas price:** 7 Gwei (minimum)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# → Paste your wallet private key into .env

# 3. Get testnet OPN tokens
# → Visit https://faucet.iopn.tech

# 4. Compile
npm run compile

# 5. Run tests
npm run test

# 6. Deploy to OPN Chain testnet
npm run deploy:testnet
```

---

## Contract Functions

### Write
| Function | Description |
|---|---|
| `createInvoice(payer, amount, dueDays, description, clientName)` | Create and send an invoice |
| `payInvoice(id)` | Pay an invoice (send exact OPN amount) |
| `cancelInvoice(id)` | Cancel an unpaid invoice (creator only) |
| `markOverdue(id)` | Flag invoice as overdue after due date |

### Read
| Function | Returns |
|---|---|
| `getInvoice(id)` | Full invoice struct |
| `getCreatorInvoices(address)` | Array of invoice IDs created by address |
| `getPayerInvoices(address)` | Array of invoice IDs assigned to payer |
| `getPaymentAmount(id)` | `(total, fee, creatorReceives)` |
| `totalInvoices()` | Total invoices ever created |

---

## Security

- Checks-Effects-Interactions pattern on all transfers
- Fee capped at 5% maximum
- Only assigned payer can settle an invoice
- Creator cannot invoice themselves
- Accidental ETH sends rejected via `receive()`

---

Built for IOPn Builder Season 6 · May–June 2026
