import { useMemo, useState } from "react";
import { Contract } from "ethers";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";

import { Header } from "./Header";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "../config/contracts";
import { useEthersSigner } from "../hooks/useEthersSigner";
import { useZamaInstance } from "../hooks/useZamaInstance";
import "../styles/Survey.css";

type Question = {
  prompt: string;
  options: readonly string[];
};

const QUESTION_COUNT = 5;

const FALLBACK_QUESTIONS: Question[] = [
  {
    prompt: "How familiar are you with Zama and FHE?",
    options: ["Just getting started", "Built a small demo", "Integrating in a product", "Running in production"],
  },
  {
    prompt: "Which Zama resource do you rely on most?",
    options: ["Docs", "Examples on GitHub", "Community answers", "Workshops or talks"],
  },
  {
    prompt: "What excites you most about Zama FHEVM?",
    options: ["Private voting", "Confidential DeFi", "User-owned data", "Compliance-friendly privacy"],
  },
  {
    prompt: "Where do you plan to deploy first?",
    options: ["Sepolia testnet", "Mainnet", "Private chain"],
  },
  {
    prompt: "What do you need next from Zama?",
    options: ["More tutorials", "SDK improvements", "Easier deployments"],
  },
];

export function SurveyApp() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [selections, setSelections] = useState<Record<number, number | null>>({});
  const [voteStatus, setVoteStatus] = useState<Record<number, string>>({});
  const [resultStatus, setResultStatus] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, number[]>>({});

  const questionReads = useReadContracts({
    contracts: Array.from({ length: QUESTION_COUNT }, (_, idx) => ({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "getQuestion",
      args: [idx],
    })),
  });

  const questionList: Question[] = useMemo(() => {
    if (!questionReads.data) return [];
    return questionReads.data
      .map((entry) => {
        if (!entry || entry.result === undefined || entry.result === null) return undefined;
        const result = entry.result as unknown;
        if (!Array.isArray(result)) return undefined;
        const [prompt, options] = result as [string, string[]];
        return { prompt, options };
      })
      .filter(Boolean) as Question[];
  }, [questionReads.data]);

  const answeredReads = useReadContracts({
    query: { enabled: isConnected && !!address },
    contracts: address
      ? Array.from({ length: QUESTION_COUNT }, (_, idx) => ({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: "hasAnswered",
          args: [address, idx] as const,
        }))
      : [],
  });

  const hasAnswered = useMemo(() => {
    if (!answeredReads.data) return {};
    return answeredReads.data.reduce<Record<number, boolean>>((acc, entry, idx) => {
      acc[idx] = Boolean(entry?.result);
      return acc;
    }, {});
  }, [answeredReads.data]);

  const handleSelect = (questionId: number, optionIndex: number) => {
    setSelections((prev) => ({ ...prev, [questionId]: optionIndex }));
  };

  const submitAnswer = async (questionId: number) => {
    try {
      if (!instance) {
        throw new Error("Encryption SDK is not ready");
      }
      if (!address) {
        throw new Error("Connect your wallet first");
      }

      const signer = await signerPromise;
      if (!signer) {
        throw new Error("Signer unavailable");
      }

      const selected = selections[questionId];
      if (selected === undefined || selected === null) {
        throw new Error("Select an option first");
      }

      setVoteStatus((prev) => ({ ...prev, [questionId]: "Encrypting your choice..." }));

      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      input.add8(selected);
      const encrypted = await input.encrypt();

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      setVoteStatus((prev) => ({ ...prev, [questionId]: "Sending transaction..." }));
      const tx = await contract.submitAnswer(questionId, encrypted.handles[0], encrypted.inputProof);
      await tx.wait();

      setVoteStatus((prev) => ({ ...prev, [questionId]: "Submitted securely" }));
      answeredReads.refetch?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit answer";
      setVoteStatus((prev) => ({ ...prev, [questionId]: message }));
      console.error("submit error", error);
    }
  };

  const loadResults = async (questionId: number) => {
    if (!instance) {
      throw new Error("Encryption SDK is not ready");
    }
    if (!publicClient) {
      throw new Error("No RPC client available");
    }

    const encryptedCounts = (await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "getEncryptedCounts",
      args: [questionId],
    })) as readonly string[];

    const handles = encryptedCounts.map((handle) => handle.toString());
    if (!handles.length) {
      throw new Error("No counts available yet");
    }

    const response = await instance.publicDecrypt(handles);
    const clearValues = (response.clearValues || {}) as Record<string, string | number | bigint | boolean>;
    const parsed: number[] = handles.map((handle) => Number(clearValues[handle] ?? 0));

    setResults((prev) => ({ ...prev, [questionId]: parsed }));
  };

  const revealResults = async (questionId: number) => {
    try {
      if (!instance) {
        throw new Error("Encryption SDK is not ready");
      }
      const signer = await signerPromise;
      if (!signer) {
        throw new Error("Signer unavailable");
      }

      setResultStatus((prev) => ({ ...prev, [questionId]: "Requesting public decrypt..." }));
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.requestPublicResults(questionId);
      await tx.wait();

      await loadResults(questionId);
      setResultStatus((prev) => ({ ...prev, [questionId]: "Results are ready to view" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch results";
      setResultStatus((prev) => ({ ...prev, [questionId]: message }));
      console.error("reveal error", error);
    }
  };

  const activeQuestions =
    questionList.length === QUESTION_COUNT && questionList.every((q) => q)
      ? questionList
      : FALLBACK_QUESTIONS;

  return (
    <div className="page-shell">
      <Header />

      <main className="survey-container">
        <section className="hero">
          <div className="hero__eyebrow">Encrypted Zama feedback</div>
          <h2 className="hero__title">Share what you think, privately.</h2>
          <p className="hero__copy">
            Five quick questions, one encrypted vote per question. Choices are summed on-chain with Zama FHE and only
            revealed when you request public results.
          </p>
          <div className="hero__status">
            <div className="status-chip">
              <span className="dot live" />
              Sepolia ready
            </div>
            <div className="status-chip ghost">{zamaLoading ? "Booting Zama relayer..." : "Encryption online"}</div>
            {zamaError ? <div className="status-chip warning">{zamaError}</div> : null}
          </div>
        </section>

        <section className="survey-grid">
          {activeQuestions.map((question, idx) => {
            const selection = selections[idx];
            const submitted = hasAnswered[idx];
            const currentResult = results[idx];

            return (
              <article className="question-card" key={question.prompt + idx}>
                <div className="question-card__top">
                  <div className="pill">Question {idx + 1}</div>
                  <div className={`pill ${submitted ? "pill--success" : "pill--muted"}`}>
                    {submitted ? "Submitted" : "Awaiting vote"}
                  </div>
                </div>

                <h3 className="question-card__title">{question.prompt}</h3>
                <div className="options-grid">
                  {question.options.map((option, optionIdx) => {
                    const isActive = selection === optionIdx;
                    return (
                      <button
                        key={option + optionIdx}
                        onClick={() => handleSelect(idx, optionIdx)}
                        className={`option-tile ${isActive ? "option-tile--active" : ""}`}
                        type="button"
                      >
                        <span className="option-index">{optionIdx + 1}</span>
                        <span className="option-text">{option}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="card-actions">
                  <button
                    className="primary-button"
                    onClick={() => submitAnswer(idx)}
                    disabled={!isConnected || zamaLoading}
                  >
                    {voteStatus[idx] ? voteStatus[idx] : "Encrypt & submit"}
                  </button>
                  <button className="ghost-button" onClick={() => revealResults(idx)} disabled={zamaLoading}>
                    {resultStatus[idx] ? resultStatus[idx] : "Request public results"}
                  </button>
                </div>

                {currentResult ? (
                  <div className="results-block">
                    <div className="results-header">
                      <span className="pill pill--muted">Public</span>
                      <span className="results-label">Decrypted counts</span>
                    </div>
                    <div className="results-grid">
                      {currentResult.map((count, optionIdx) => (
                        <div className="result-row" key={`${question.prompt}-${optionIdx}`}>
                          <div className="result-text">
                            <span className="option-index small">{optionIdx + 1}</span>
                            <span>{question.options[optionIdx]}</span>
                          </div>
                          <div className="bar">
                            <div
                              className="bar-fill"
                              style={{
                                width:
                                  Math.min(
                                    100,
                                    currentResult.reduce((a, b) => Math.max(a, b), 0) === 0
                                      ? 10
                                      : (count / Math.max(...currentResult)) * 100,
                                  ) + "%",
                              }}
                            />
                          </div>
                          <span className="count-value">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        {!isConnected ? (
          <div className="cta-card">
            <p className="cta-title">Connect your wallet to cast encrypted votes.</p>
            <p className="cta-subtitle">We never store plaintext choices, and counts only become public when asked.</p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
