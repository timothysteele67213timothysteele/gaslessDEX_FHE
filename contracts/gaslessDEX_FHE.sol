pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract GaslessDEXFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    mapping(uint256 => bool) public isBatchOpen;
    mapping(uint256 => uint256) public batchEncryptedTradeCount;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PauseToggled(bool indexed paused);
    event CooldownSecondsSet(uint256 indexed cooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event TradeSubmitted(address indexed provider, uint256 indexed batchId, uint256 encryptedTradeId);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalVolume);

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchNotOpen();
    error BatchAlreadyOpen();
    error InvalidBatchId();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionRequestCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        emit ProviderAdded(owner);
        cooldownSeconds = 60; // Default cooldown
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseToggled(_paused);
    }

    function setCooldownSeconds(uint256 _cooldownSeconds) external onlyOwner {
        cooldownSeconds = _cooldownSeconds;
        emit CooldownSecondsSet(_cooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        if (isBatchOpen[currentBatchId]) revert BatchAlreadyOpen();
        isBatchOpen[currentBatchId] = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        if (!isBatchOpen[currentBatchId]) revert BatchNotOpen();
        isBatchOpen[currentBatchId] = false;
        currentBatchId++;
        emit BatchClosed(currentBatchId - 1);
    }

    function submitEncryptedTrade(
        euint32 encryptedTokenA,
        euint32 encryptedTokenB,
        euint32 encryptedAmountA,
        euint32 encryptedAmountB,
        euint32 encryptedMinOutputA,
        euint32 encryptedMinOutputB,
        euint32 encryptedNonce,
        euint32 encryptedSignatureV,
        euint32 encryptedSignatureR,
        euint32 encryptedSignatureS
    ) external onlyProvider whenNotPaused checkSubmissionCooldown {
        if (!isBatchOpen[currentBatchId]) revert BatchNotOpen();
        _initIfNeeded(encryptedTokenA);
        _initIfNeeded(encryptedTokenB);
        _initIfNeeded(encryptedAmountA);
        _initIfNeeded(encryptedAmountB);
        _initIfNeeded(encryptedMinOutputA);
        _initIfNeeded(encryptedMinOutputB);
        _initIfNeeded(encryptedNonce);
        _initIfNeeded(encryptedSignatureV);
        _initIfNeeded(encryptedSignatureR);
        _initIfNeeded(encryptedSignatureS);

        // Store encrypted trade data (example: increment a counter for this batch)
        batchEncryptedTradeCount[currentBatchId]++;
        lastSubmissionTime[msg.sender] = block.timestamp;

        emit TradeSubmitted(msg.sender, currentBatchId, batchEncryptedTradeCount[currentBatchId]);
    }

    function requestBatchDecryption() external onlyProvider whenNotPaused checkDecryptionRequestCooldown {
        if (isBatchOpen[currentBatchId]) revert BatchNotOpen(); // Must be closed to process
        if (batchEncryptedTradeCount[currentBatchId] == 0) revert InvalidBatchId(); // No trades to process

        euint32 encryptedTotalVolume = FHE.asEuint32(0);
        // Example: Sum encrypted amounts (this is a simplified example, real DEX logic is more complex)
        // For a real DEX, you'd iterate through stored encrypted trades for this batch.
        // Here, we just use a placeholder sum for demonstration.
        // The actual aggregation logic would depend on how trades are stored and processed.
        // For this example, we'll assume encryptedTotalVolume is derived from batchEncryptedTradeCount
        // and some hypothetical encrypted values. This part is illustrative.

        // Placeholder for actual aggregation:
        // If batchEncryptedTradeCount[currentBatchId] > 0, sum some encrypted values.
        // For this example, we'll just use a fixed encrypted value if count > 0.
        if (batchEncryptedTradeCount[currentBatchId] > 0) {
            // This is a placeholder. In a real scenario, you'd sum actual encrypted trade volumes.
            // For instance, if you had an array of encrypted volumes:
            // for (uint i = 0; i < batchEncryptedTradeCount[currentBatchId]; i++) {
            //    encryptedTotalVolume = encryptedTotalVolume.add(encryptedVolumes[i]);
            // }
            // For this example, we'll just add 1 to an initialized encryptedTotalVolume
            // to demonstrate the FHE.add operation.
            encryptedTotalVolume = encryptedTotalVolume.add(FHE.asEuint32(1));
        }

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = encryptedTotalVolume.toBytes32();

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: currentBatchId,
            stateHash: stateHash,
            processed: false
        });

        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, currentBatchId);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        // @dev Replay protection: ensure this callback hasn't been processed for this requestId
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        // @dev State verification: ensure the contract state relevant to this decryption request
        // has not changed since the request was made. This prevents certain front-running or
        // reordering attacks.
        // Rebuild the ciphertexts array in the exact same order as in requestBatchDecryption
        euint32 encryptedTotalVolume; // Placeholder for rebuilding logic
        // In a real scenario, you'd rebuild encryptedTotalVolume from contract storage
        // based on decryptionContexts[requestId].batchId
        // For this example, we'll assume it's still FHE.asEuint32(1) if count > 0
        if (batchEncryptedTradeCount[decryptionContexts[requestId].batchId] > 0) {
            encryptedTotalVolume = FHE.asEuint32(1); // Simplified for example
        } else {
            encryptedTotalVolume = FHE.asEuint32(0);
        }
        
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = encryptedTotalVolume.toBytes32();
        bytes32 currentHash = _hashCiphertexts(cts);

        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        // Verify the proof of correct decryption
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert InvalidProof();
        }

        // Decode cleartexts in the same order as cts
        uint32 totalVolume = abi.decode(cleartexts, (uint32));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, totalVolume);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 v) internal {
        if (!v.isInitialized()) {
            v.initialize();
        }
    }

    function _requireInitialized(euint32 v) internal view {
        if (!v.isInitialized()) {
            revert("FHE: euint32 not initialized");
        }
    }
}