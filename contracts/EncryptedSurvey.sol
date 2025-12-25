// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint32, euint8, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Encrypted survey contract for Zama feedback
/// @notice Stores encrypted vote counts for fixed questions and allows public result requests
contract EncryptedSurvey is ZamaEthereumConfig {
    uint8 public constant QUESTION_COUNT = 5;

    struct SurveyQuestion {
        string prompt;
        string[] options;
    }

    SurveyQuestion[] private questions;
    uint8[] private optionCounts;
    mapping(uint8 questionId => euint32[] counts) private encryptedCounts;
    mapping(uint8 questionId => mapping(address user => bool)) private hasResponded;

    event AnswerSubmitted(address indexed participant, uint8 indexed questionId);
    event ResultsRequested(address indexed requester, uint8 indexed questionId);
    event ResultsMadePublic(uint8 indexed questionId, bytes32[] handles);

    constructor() {
        string[] memory q0 = new string[](4);
        q0[0] = "Just getting started";
        q0[1] = "Built a small demo";
        q0[2] = "Integrating in a product";
        q0[3] = "Running in production";
        _addQuestion("How familiar are you with Zama and FHE?", q0);

        string[] memory q1 = new string[](4);
        q1[0] = "Docs";
        q1[1] = "Examples on GitHub";
        q1[2] = "Community answers";
        q1[3] = "Workshops or talks";
        _addQuestion("Which Zama resource do you rely on most?", q1);

        string[] memory q2 = new string[](4);
        q2[0] = "Private voting";
        q2[1] = "Confidential DeFi";
        q2[2] = "User-owned data";
        q2[3] = "Compliance-friendly privacy";
        _addQuestion("What excites you most about Zama FHEVM?", q2);

        string[] memory q3 = new string[](3);
        q3[0] = "Sepolia testnet";
        q3[1] = "Mainnet";
        q3[2] = "Private chain";
        _addQuestion("Where do you plan to deploy first?", q3);

        string[] memory q4 = new string[](3);
        q4[0] = "More tutorials";
        q4[1] = "SDK improvements";
        q4[2] = "Easier deployments";
        _addQuestion("What do you need next from Zama?", q4);
    }

    function submitAnswer(uint8 questionId, externalEuint8 encryptedChoice, bytes calldata inputProof) external {
        require(questionId < questions.length, "Invalid question");
        require(!hasResponded[questionId][msg.sender], "Answer already recorded");

        uint8 optionCount = optionCounts[questionId];
        require(optionCount > 1 && optionCount <= 4, "Options not configured");

        euint8 choice = FHE.fromExternal(encryptedChoice, inputProof);

        for (uint8 i = 0; i < optionCount; i++) {
            ebool isSelection = FHE.eq(choice, FHE.asEuint8(i));
            euint8 addition = FHE.select(isSelection, FHE.asEuint8(1), FHE.asEuint8(0));
            euint32 updatedCount = FHE.add(encryptedCounts[questionId][i], FHE.asEuint32(addition));

            encryptedCounts[questionId][i] = updatedCount;

            FHE.allowThis(updatedCount);
            FHE.allow(updatedCount, msg.sender);
        }

        hasResponded[questionId][msg.sender] = true;
        emit AnswerSubmitted(msg.sender, questionId);
    }

    function getQuestionCount() external pure returns (uint8) {
        return QUESTION_COUNT;
    }

    function getQuestion(uint8 questionId) external view returns (string memory prompt, string[] memory options) {
        require(questionId < questions.length, "Invalid question");
        SurveyQuestion storage question = questions[questionId];
        return (question.prompt, question.options);
    }

    function getOptionCount(uint8 questionId) external view returns (uint8) {
        require(questionId < questions.length, "Invalid question");
        return optionCounts[questionId];
    }

    function getEncryptedCounts(uint8 questionId) external view returns (euint32[] memory) {
        require(questionId < questions.length, "Invalid question");
        return encryptedCounts[questionId];
    }

    function hasAnswered(address user, uint8 questionId) external view returns (bool) {
        require(questionId < questions.length, "Invalid question");
        return hasResponded[questionId][user];
    }

    function requestPublicResults(uint8 questionId) external returns (bytes32[] memory handles) {
        require(questionId < questions.length, "Invalid question");

        uint8 optionCount = optionCounts[questionId];
        handles = new bytes32[](optionCount);

        for (uint8 i = 0; i < optionCount; i++) {
            euint32 updated = FHE.makePubliclyDecryptable(encryptedCounts[questionId][i]);
            encryptedCounts[questionId][i] = updated;
            handles[i] = euint32.unwrap(updated);
        }

        emit ResultsRequested(msg.sender, questionId);
        emit ResultsMadePublic(questionId, handles);
        return handles;
    }

    function _addQuestion(string memory prompt, string[] memory options) private {
        require(questions.length < QUESTION_COUNT, "Too many questions");
        require(options.length >= 2 && options.length <= 4, "Invalid option count");

        questions.push(SurveyQuestion({prompt: prompt, options: options}));
        optionCounts.push(uint8(options.length));

        euint32[] memory counts = new euint32[](options.length);
        for (uint8 i = 0; i < options.length; i++) {
            euint32 initial = FHE.asEuint32(0);
            FHE.allowThis(initial);
            counts[i] = initial;
        }

        encryptedCounts[uint8(questions.length - 1)] = counts;
    }
}
