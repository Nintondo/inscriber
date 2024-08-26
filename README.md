# bells-inscriber 📜🔔

Welcome to `bells-inscriber`, your friendly neighborhood tool for inscribing data onto the Bellscoin blockchain! 🐾💰 If you're looking to leave your mark on the blockchain in a fun, animal-crossing inspired way, you've come to the right place. Here's everything you need to know to get started:

## 🌟 Features

- **Multiple Inscriptions**: Prepare and inscribe multiple pieces of data at once. 🐼📜
- **Custom Content**: Inscribe any type of data with custom content types. 🎨
- **Efficient UTXO Management**: Handles UTXO selection and management for your inscriptions. 🛠️
- **Network Agnostic**: Works across different Bellscoin networks. 🌐

## 📦 Installation

```bash
npm install bells-inscriber
```

## 🚀 Usage

### Preparing for Multiple Inscriptions

To prepare for inscribing multiple pieces of data:

```javascript
import { prepareToInscribeMultipleInscriptions } from 'bells-inscriber';

const params = {
  signPsbtHex: async (psbtHex) => { /* Your signing function */ },
  utxos: /* Array of UTXOs */,
  feeRate: 1, // satoshi/vbyte
  amount: 5, // Number of inscriptions
  signleInscriptionCost: 1000, // Cost for each inscription in satoshis
  address: 'your-bellscoin-address',
  network: { /* Bellscoin network config */ }
};

prepareToInscribeMultipleInscriptions(params)
  .then(txHex => console.log('Transaction Hex:', txHex))
  .catch(err => console.error('Error:', err));
```

### Inscribing Data

To inscribe your data:

```javascript
import { inscribe } from 'bells-inscriber';

const inscribeParams = {
  toAddress: 'recipient-address',
  fromAddress: 'your-address',
  contentType: 'text/plain',
  data: Buffer.from('Hello, Bellscoin!'),
  feeRate: 1,
  network: { /* Bellscoin network config */ },
  utxos: /* Array of UTXOs */,
  publicKey: Buffer.from('your-public-key'),
  signPsbtHex: async (psbtHex) => { /* Your signing function */ }
};

inscribe(inscribeParams)
  .then(txs => console.log('Inscription Transactions:', txs))
  .catch(err => console.error('Inscription Error:', err));
```

## 🐛 Development

- **Clone the repo**: `git clone git@github.com:your-username/bells-inscriber.git`
- **Install dependencies**: `npm install`
- **Run tests**: `npm test`
- **Build**: `npm run build`

## 🛠️ Contributing

Contributions are welcome! 🐻 Feel free to fork the repository and submit pull requests.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## 🎮 Inspiration

Inspired by the whimsical world of Animal Crossing, where bells are currency, and every transaction is a new adventure. Let's make the Bellscoin blockchain as fun and engaging as our favorite island getaway!

---

Feel free to dive into the code, customize it for your Bellscoin adventures, and remember, every inscription is a new story on the blockchain! 📖🔔
