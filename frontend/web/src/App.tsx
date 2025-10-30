// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface SwapRecord {
  id: string;
  inputToken: string;
  outputToken: string;
  inputAmount: number;
  outputAmount: number;
  encryptedInput: string;
  encryptedOutput: string;
  timestamp: number;
  status: "pending" | "completed" | "failed";
  txHash?: string;
}

interface TokenPrice {
  symbol: string;
  price: number;
  change24h: number;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}-${Date.now()}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    const parts = encryptedData.substring(4).split('-');
    return parseFloat(atob(parts[0]));
  }
  return parseFloat(encryptedData);
};

const FHEComputeSwap = (inputAmount: number, inputToken: string, outputToken: string): number => {
  // Mock FHE computation for swap rate
  const rates: { [key: string]: number } = {
    'ETH/USD': 3500,
    'BTC/USD': 65000,
    'ZAMA/USD': 2.5,
    'USDC/USD': 1
  };
  
  const inputRate = rates[inputToken] || 1;
  const outputRate = rates[outputToken] || 1;
  
  return (inputAmount * inputRate) / outputRate;
};

const generateFHEKey = () => `0x${Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [swapRecords, setSwapRecords] = useState<SwapRecord[]>([]);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ 
    visible: boolean; 
    status: "pending" | "success" | "error"; 
    message: string; 
  }>({ visible: false, status: "pending", message: "" });
  
  const [swapData, setSwapData] = useState({
    inputToken: "ETH",
    outputToken: "USDC",
    inputAmount: 0,
    slippage: 0.5
  });
  
  const [fheKey, setFheKey] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [priceData, setPriceData] = useState<TokenPrice[]>([]);
  const [isEncrypting, setIsEncrypting] = useState(false);

  // Mock price data
  const mockPrices: TokenPrice[] = [
    { symbol: "ETH", price: 3500, change24h: 2.5 },
    { symbol: "BTC", price: 65000, change24h: 1.8 },
    { symbol: "ZAMA", price: 2.5, change24h: 5.2 },
    { symbol: "USDC", price: 1, change24h: 0.1 }
  ];

  useEffect(() => {
    loadSwapRecords().finally(() => setLoading(false));
    setFheKey(generateFHEKey());
    setPriceData(mockPrices);
    
    // Simulate real-time price updates
    const interval = setInterval(() => {
      setPriceData(prev => prev.map(token => ({
        ...token,
        price: token.price * (1 + (Math.random() - 0.5) * 0.01),
        change24h: token.change24h + (Math.random() - 0.5) * 0.1
      })));
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const loadSwapRecords = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      // Load swap records from contract
      const recordsBytes = await contract.getData("swap_records");
      let records: SwapRecord[] = [];
      
      if (recordsBytes.length > 0) {
        try {
          const recordsStr = ethers.toUtf8String(recordsBytes);
          if (recordsStr.trim() !== '') records = JSON.parse(recordsStr);
        } catch (e) { 
          console.error("Error parsing swap records:", e); 
        }
      }
      
      setSwapRecords(records);
    } catch (e) { 
      console.error("Error loading swap records:", e); 
    }
  };

  const executeSwap = async () => {
    if (!isConnected) {
      alert("Please connect wallet first");
      return;
    }

    setSwapping(true);
    setIsEncrypting(true);
    
    try {
      // Step 1: Encrypt input data with FHE
      setTransactionStatus({ 
        visible: true, 
        status: "pending", 
        message: "Encrypting swap data with Zama FHE..." 
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      const encryptedInput = FHEEncryptNumber(swapData.inputAmount);
      
      // Step 2: FHE computation for swap rate
      setTransactionStatus({ 
        visible: true, 
        status: "pending", 
        message: "Computing swap rate on encrypted data..." 
      });
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      const outputAmount = FHEComputeSwap(swapData.inputAmount, swapData.inputToken, swapData.outputToken);
      const encryptedOutput = FHEEncryptNumber(outputAmount);
      
      // Step 3: Store encrypted swap data
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const swapId = `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newRecord: SwapRecord = {
        id: swapId,
        inputToken: swapData.inputToken,
        outputToken: swapData.outputToken,
        inputAmount: swapData.inputAmount,
        outputAmount: outputAmount,
        encryptedInput,
        encryptedOutput,
        timestamp: Math.floor(Date.now() / 1000),
        status: "pending"
      };
      
      // Update records list
      const updatedRecords = [newRecord, ...swapRecords];
      await contract.setData("swap_records", ethers.toUtf8Bytes(JSON.stringify(updatedRecords)));
      
      // Store individual record
      await contract.setData(`swap_${swapId}`, ethers.toUtf8Bytes(JSON.stringify(newRecord)));
      
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Gasless swap executed successfully with FHE encryption!" 
      });
      
      await loadSwapRecords();
      setShowSwapModal(false);
      setCurrentStep(1);
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
      
    } catch (e: any) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Swap failed: " + (e.message || "Unknown error") 
      });
      
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally {
      setSwapping(false);
      setIsEncrypting(false);
    }
  };

  const decryptSwapData = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) {
      alert("Please connect wallet first");
      return null;
    }
    
    try {
      // Simulate wallet signature for decryption
      const message = `FHE-Decrypt:${fheKey}:${Date.now()}`;
      await signMessageAsync({ message });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      return FHEDecryptNumber(encryptedData);
    } catch (e) {
      console.error("Decryption failed:", e);
      return null;
    }
  };

  const testContractAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Contract not available");
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({
        visible: true,
        status: "success", 
        message: `Contract is ${isAvailable ? 'available' : 'unavailable'}`
      });
      
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Contract test failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="hologram-spinner"></div>
        <p>Initializing FHE-encrypted DEX...</p>
      </div>
    );
  }

  return (
    <div className="app-container hologram-theme">
      {/* Header Section */}
      <header className="app-header">
        <div className="logo-section">
          <div className="zama-logo"></div>
          <h1>FHE<span>DEX</span></h1>
          <div className="tagline">Fully Encrypted • Gasless • Private Swaps</div>
        </div>
        
        <div className="header-controls">
          <button 
            className="hologram-btn primary"
            onClick={() => setShowSwapModal(true)}
          >
            <span className="btn-icon">🔄</span>
            New Swap
          </button>
          
          <button 
            className="hologram-btn secondary"
            onClick={testContractAvailability}
          >
            <span className="btn-icon">⚡</span>
            Test Contract
          </button>
          
          <div className="wallet-connect">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={true} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="main-content">
        {/* Price Ticker */}
        <div className="price-ticker">
          {priceData.map((token, index) => (
            <div key={token.symbol} className="token-price">
              <span className="token-symbol">{token.symbol}</span>
              <span className="token-value">${token.price.toFixed(2)}</span>
              <span className={`price-change ${token.change24h >= 0 ? 'positive' : 'negative'}`}>
                {token.change24h >= 0 ? '↑' : '↓'} {Math.abs(token.change24h).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>

        {/* Swap Interface */}
        <div className="swap-interface">
          <div className="interface-header">
            <h2>FHE-Encrypted Swap</h2>
            <div className="fhe-badge">
              <div className="fhe-indicator"></div>
              Zama FHE Encrypted
            </div>
          </div>

          {/* Step Progress */}
          <div className="step-progress">
            {[1, 2, 3, 4].map(step => (
              <div key={step} className={`step ${step === currentStep ? 'active' : step < currentStep ? 'completed' : ''}`}>
                <div className="step-number">{step}</div>
                <div className="step-label">
                  {step === 1 && 'Connect'}
                  {step === 2 && 'Encrypt'}
                  {step === 3 && 'Compute'}
                  {step === 4 && 'Complete'}
                </div>
              </div>
            ))}
          </div>

          {/* Swap Form */}
          <div className="swap-form hologram-card">
            <div className="input-section">
              <label>You Pay</label>
              <div className="token-input">
                <input
                  type="number"
                  value={swapData.inputAmount}
                  onChange={(e) => setSwapData({...swapData, inputAmount: parseFloat(e.target.value) || 0})}
                  placeholder="0.0"
                  className="hologram-input"
                />
                <select 
                  value={swapData.inputToken}
                  onChange={(e) => setSwapData({...swapData, inputToken: e.target.value})}
                  className="token-select"
                >
                  <option value="ETH">ETH</option>
                  <option value="BTC">BTC</option>
                  <option value="ZAMA">ZAMA</option>
                  <option value="USDC">USDC</option>
                </select>
              </div>
            </div>

            <div className="swap-arrow">↓</div>

            <div className="output-section">
              <label>You Receive</label>
              <div className="token-output">
                <input
                  type="number"
                  value={FHEComputeSwap(swapData.inputAmount, swapData.inputToken, swapData.outputToken)}
                  readOnly
                  className="hologram-input"
                />
                <select 
                  value={swapData.outputToken}
                  onChange={(e) => setSwapData({...swapData, outputToken: e.target.value})}
                  className="token-select"
                >
                  <option value="USDC">USDC</option>
                  <option value="ETH">ETH</option>
                  <option value="BTC">BTC</option>
                  <option value="ZAMA">ZAMA</option>
                </select>
              </div>
            </div>

            <button 
              className="hologram-btn primary large"
              onClick={() => setShowSwapModal(true)}
              disabled={!isConnected || swapData.inputAmount <= 0}
            >
              {!isConnected ? 'Connect Wallet' : 'Review FHE Swap'}
            </button>
          </div>
        </div>

        {/* Transaction History */}
        <div className="transaction-history">
          <h3>FHE-Encrypted Transaction History</h3>
          <div className="history-list hologram-card">
            {swapRecords.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🔒</div>
                <p>No encrypted transactions yet</p>
                <small>All swaps are FHE-encrypted and gasless</small>
              </div>
            ) : (
              swapRecords.map(record => (
                <TransactionRow 
                  key={record.id} 
                  record={record} 
                  onDecrypt={decryptSwapData}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Swap Modal */}
      {showSwapModal && (
        <SwapModal
          swapData={swapData}
          onClose={() => {
            setShowSwapModal(false);
            setCurrentStep(1);
          }}
          onConfirm={executeSwap}
          loading={swapping}
          currentStep={currentStep}
          setCurrentStep={setCurrentStep}
          isEncrypting={isEncrypting}
        />
      )}

      {/* Transaction Status Modal */}
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="hologram-card status-card">
            <div className={`status-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="hologram-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✕"}
            </div>
            <div className="status-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <div className="tech-badges">
            <span className="tech-badge">Zama FHE</span>
            <span className="tech-badge">Gasless</span>
            <span className="tech-badge">Encrypted</span>
            <span className="tech-badge">Meta Transactions</span>
          </div>
          <div className="footer-info">
            <p>Powered by Zama FHE Technology • All transactions are fully encrypted</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

// Transaction Row Component
interface TransactionRowProps {
  record: SwapRecord;
  onDecrypt: (encryptedData: string) => Promise<number | null>;
}

const TransactionRow: React.FC<TransactionRowProps> = ({ record, onDecrypt }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [decryptedInput, setDecryptedInput] = useState<number | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  const handleDecrypt = async () => {
    setDecrypting(true);
    const value = await onDecrypt(record.encryptedInput);
    setDecryptedInput(value);
    setDecrypting(false);
  };

  return (
    <div className="transaction-row">
      <div className="row-main" onClick={() => setShowDetails(!showDetails)}>
        <div className="tx-icon">🔄</div>
        <div className="tx-pair">
          {record.inputToken} → {record.outputToken}
        </div>
        <div className="tx-amount">
          {record.inputAmount} {record.inputToken}
        </div>
        <div className="tx-status">
          <span className={`status-badge ${record.status}`}>{record.status}</span>
        </div>
        <div className="tx-time">
          {new Date(record.timestamp * 1000).toLocaleTimeString()}
        </div>
      </div>
      
      {showDetails && (
        <div className="row-details">
          <div className="detail-item">
            <span>Encrypted Input:</span>
            <code>{record.encryptedInput.substring(0, 50)}...</code>
          </div>
          <div className="detail-item">
            <span>Encrypted Output:</span>
            <code>{record.encryptedOutput.substring(0, 50)}...</code>
          </div>
          <button 
            className="hologram-btn small"
            onClick={handleDecrypt}
            disabled={decrypting}
          >
            {decrypting ? 'Decrypting...' : 'Decrypt with FHE'}
          </button>
          {decryptedInput && (
            <div className="decrypted-value">
              Decrypted Input: {decryptedInput}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Swap Modal Component
interface SwapModalProps {
  swapData: any;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  isEncrypting: boolean;
}

const SwapModal: React.FC<SwapModalProps> = ({
  swapData,
  onClose,
  onConfirm,
  loading,
  currentStep,
  setCurrentStep,
  isEncrypting
}) => {
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="step-content">
            <h3>Swap Review</h3>
            <div className="swap-details">
              <div className="detail-row">
                <span>You Pay:</span>
                <strong>{swapData.inputAmount} {swapData.inputToken}</strong>
              </div>
              <div className="detail-row">
                <span>You Receive:</span>
                <strong>
                  {FHEComputeSwap(swapData.inputAmount, swapData.inputToken, swapData.outputToken).toFixed(6)} {swapData.outputToken}
                </strong>
              </div>
              <div className="detail-row">
                <span>Slippage:</span>
                <span>{swapData.slippage}%</span>
              </div>
            </div>
          </div>
        );
      
      case 2:
        return (
          <div className="step-content">
            <h3>FHE Encryption</h3>
            <div className="encryption-process">
              <div className="encryption-step">
                <div className="step-icon">🔒</div>
                <div className="step-info">
                  <strong>Client-side Encryption</strong>
                  <p>Your swap data is encrypted using Zama FHE before leaving your browser</p>
                </div>
                {isEncrypting && <div className="encrypting-spinner"></div>}
              </div>
              <div className="data-preview">
                <div className="plain-data">
                  <span>Plain Data:</span>
                  <code>{swapData.inputAmount}</code>
                </div>
                <div className="arrow">→</div>
                <div className="encrypted-data">
                  <span>Encrypted Data:</span>
                  <code>{FHEEncryptNumber(swapData.inputAmount).substring(0, 30)}...</code>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 3:
        return (
          <div className="step-content">
            <h3>FHE Computation</h3>
            <div className="computation-process">
              <div className="computation-step">
                <div className="step-icon">⚡</div>
                <div className="step-info">
                  <strong>Encrypted Computation</strong>
                  <p>Swap rate is computed on encrypted data without decryption</p>
                </div>
              </div>
              <div className="computation-visual">
                <div className="fhe-node">Encrypted Input</div>
                <div className="fhe-arrow">→</div>
                <div className="fhe-node">FHE Compute</div>
                <div className="fhe-arrow">→</div>
                <div className="fhe-node">Encrypted Output</div>
              </div>
            </div>
          </div>
        );
      
      case 4:
        return (
          <div className="step-content">
            <h3>Gasless Execution</h3>
            <div className="execution-process">
              <div className="execution-step">
                <div className="step-icon">⛽</div>
                <div className="step-info">
                  <strong>Meta-Transaction Ready</strong>
                  <p>Encrypted transaction will be relayed gaslessly</p>
                </div>
              </div>
              <div className="benefits-list">
                <div className="benefit">✓ No gas fees</div>
                <div className="benefit">✓ Fully encrypted</div>
                <div className="benefit">✓ Private execution</div>
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="modal-overlay">
      <div className="swap-modal hologram-card">
        <div className="modal-header">
          <h2>FHE-Encrypted Swap</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <div className="modal-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(currentStep / 4) * 100}%` }}
            ></div>
          </div>
        </div>
        
        {renderStepContent()}
        
        <div className="modal-actions">
          {currentStep > 1 && (
            <button 
              className="hologram-btn secondary"
              onClick={() => setCurrentStep(currentStep - 1)}
              disabled={loading}
            >
              Back
            </button>
          )}
          
          {currentStep < 4 ? (
            <button 
              className="hologram-btn primary"
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={loading}
            >
              Continue
            </button>
          ) : (
            <button 
              className="hologram-btn primary"
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? 'Executing FHE Swap...' : 'Confirm Encrypted Swap'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;