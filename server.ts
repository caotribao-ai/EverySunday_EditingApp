import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import axios from "axios";
import { initializeApp } from 'firebase/app';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import admin from 'firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createJobQueue, isWorkerProcess, shouldRunInlineWorkers, type QueuedTask } from "./server/queue/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf-8'));

// Initialize Firebase Admin with the same project/database used by the client app.
const adminApp = admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
});
const adminDb = firebaseConfig.firestoreDatabaseId
  ? getFirestore(adminApp, firebaseConfig.firestoreDatabaseId)
  : getFirestore(adminApp);

const firebaseApp = initializeApp(firebaseConfig);
const storage = getStorage(firebaseApp);

// Setup FFMPEG path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const isProduction = process.env.NODE_ENV === "production";
  const isFullTestMode = !isProduction && process.env.LOCAL_FULL_TEST_MODE === "true";
  const allowLocalGuestAuthBypass = !isProduction && process.env.LOCAL_DEV_BYPASS_AUTH === "true";

  if (isProduction && process.env.LOCAL_DEV_BYPASS_AUTH === "true") {
    throw new Error("Security misconfiguration: LOCAL_DEV_BYPASS_AUTH=true is not allowed in production.");
  }
  if (isProduction && process.env.LOCAL_FULL_TEST_MODE === "true") {
    throw new Error("Security misconfiguration: LOCAL_FULL_TEST_MODE=true is not allowed in production.");
  }
  if (allowLocalGuestAuthBypass) {
    console.warn("[SECURITY] LOCAL_DEV_BYPASS_AUTH is enabled for local development.");
  }
  if (isFullTestMode) {
    console.warn("[SECURITY] LOCAL_FULL_TEST_MODE is enabled for local development.");
  }

  // Increase limits for JSON and URL encoded bodies
  app.use(express.json({ limit: "500mb" }));
  app.use(express.urlencoded({ limit: "500mb", extended: true }));
  app.set("trust proxy", true);

  type IpBucket = { count: number; resetAt: number };
  const createIpRateLimiter = (maxRequests: number, windowMs: number) => {
    const buckets = new Map<string, IpBucket>();
    return (req: Request, res: Response, next: NextFunction) => {
      if (isFullTestMode) return next();
      const rawIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
        || req.socket.remoteAddress
        || req.ip
        || "unknown";
      const ip = rawIp.replace("::ffff:", "");
      const now = Date.now();
      const bucket = buckets.get(ip);

      if (!bucket || now > bucket.resetAt) {
        buckets.set(ip, { count: 1, resetAt: now + windowMs });
        return next();
      }

      if (bucket.count >= maxRequests) {
        const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        res.setHeader("Retry-After", String(retryAfterSec));
        return res.status(429).json({ error: `Quá nhiều yêu cầu từ IP này. Vui lòng thử lại sau ${retryAfterSec}s.` });
      }

      bucket.count += 1;
      next();
    };
  };

  app.use("/api", createIpRateLimiter(240, 60_000));

  // Configure Multer for video uploads
  const upload = multer({
    dest: "uploads/",
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  });

  // Ensure uploads directory exists
  if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
  }

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  const getBearerToken = (req: Request) => {
    const authHeader = req.headers.authorization || "";
    return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  };
  const getErrorMessage = (error: unknown) => String((error as any)?.message || "");
  const isLimitError = (error: unknown) => getErrorMessage(error).toLowerCase().includes("giới hạn");
  const isCreditError = (error: unknown) => getErrorMessage(error).toLowerCase().includes("credits");
  const safeErrorMessage = (fallback = "Hệ thống đang bận, vui lòng thử lại sau.") => fallback;

  type AuthedRequest = Request & { firebaseUser?: DecodedIdToken };

  const requireFirebaseUser = async (req: Request) => {
    const token = getBearerToken(req);
    if (!token) {
      throw new Error("missing_auth_token");
    }
    return admin.auth().verifyIdToken(token);
  };

  const requireFirebaseUserMiddleware = async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      req.firebaseUser = await requireFirebaseUser(req);
      next();
    } catch (error: any) {
      const host = req.hostname || "";
      const isLocalHost = host === "localhost" || host === "127.0.0.1";
      if (allowLocalGuestAuthBypass && isLocalHost) {
        req.firebaseUser = {
          uid: "local-dev-user",
          email: "local-dev@everysunday.local",
        } as DecodedIdToken;
        return next();
      }
      if (error.message === "missing_auth_token" || String(error.code || "").startsWith("auth/")) {
        return res.status(401).json({ error: "Bạn cần đăng nhập để sử dụng tính năng này." });
      }
      next(error);
    }
  };

  const getUserPlan = async (userId: string) => {
    if (userId === "local-dev-user") return "FREE";
    try {
      const snap = await adminDb.collection("users").doc(userId).get();
      const plan = snap.exists ? snap.data()?.plan : null;
      return plan === "BASIC" || plan === "PRO" ? plan : "FREE";
    } catch (error: any) {
      const message = String(error?.message || "");
      if (process.env.NODE_ENV !== "production" && message.includes("default credentials")) {
        return "FREE";
      }
      throw error;
    }
  };

  const PLAN_LIMITS = {
    FREE: {
      maxUploadBytes: 50 * 1024 * 1024,
      maxDurationSeconds: 60,
      monthlyTranscribeJobs: 5,
      dailyAiChatRequests: 40,
      dailyTranscribeJobs: 3,
      dailyExportJobs: 3,
      dailyBrollAnalyses: 5,
      dailyPexelsSearches: 25,
    },
    BASIC: {
      maxUploadBytes: 100 * 1024 * 1024,
      maxDurationSeconds: 180,
      monthlyTranscribeJobs: 30,
      dailyAiChatRequests: 500,
      dailyTranscribeJobs: 10,
      dailyExportJobs: 20,
      dailyBrollAnalyses: 30,
      dailyPexelsSearches: 100,
    },
    PRO: {
      maxUploadBytes: 500 * 1024 * 1024,
      maxDurationSeconds: 600,
      monthlyTranscribeJobs: 100,
      dailyAiChatRequests: 2000,
      dailyTranscribeJobs: 25,
      dailyExportJobs: 100,
      dailyBrollAnalyses: 150,
      dailyPexelsSearches: 500,
    },
  } as const;

  const PLAN_EXPORT = {
    FREE: { width: 720, height: 1280, watermark: true, crf: "26" },
    BASIC: { width: 1080, height: 1920, watermark: false, crf: "23" },
    PRO: { width: 1080, height: 1920, watermark: false, crf: "20" },
  } as const;

  type PlanType = keyof typeof PLAN_LIMITS;

  const PLAN_CREDITS = {
    FREE: { monthlyIncluded: 120 },
    BASIC: { monthlyIncluded: 2200 },
    PRO: { monthlyIncluded: 12000 },
  } as const;

  const FEATURE_CREDIT_COST = {
    aiChatBase: 1,
    aiChatPer1kChars: 1,
    brollAnalysisBase: 8,
    transcribePerMinute: 6,
    exportPerMinute: 3,
  } as const;

  type UsageKey = "aiChatRequests" | "transcribeJobs" | "exportJobs" | "brollAnalyses" | "pexelsSearches";

  const usageDocId = (userId: string) => {
    const date = new Date().toISOString().slice(0, 10);
    return `${userId}_${date}`;
  };

  const monthlyLedgerDocId = (userId: string, now: Date = new Date()) => {
    const month = now.toISOString().slice(0, 7);
    return `${userId}_${month}`;
  };

  const monthlyUsageDocId = (userId: string, now: Date = new Date()) => monthlyLedgerDocId(userId, now);

  const getMonthlyTranscribeCount = async (userId: string) => {
    if (isLocalDevUser(userId)) return 0;
    try {
      const snap = await adminDb.collection("usage_monthly").doc(monthlyUsageDocId(userId)).get();
      return Number(snap.exists ? snap.data()?.transcribeJobs || 0 : 0);
    } catch (error) {
      if (process.env.NODE_ENV !== "production" && isMissingDefaultCredentials(error)) return 0;
      throw error;
    }
  };

  const assertMonthlyTranscribeUsage = async (userId: string, plan: PlanType) => {
    if (isFullTestMode || isLocalDevUser(userId)) return;
    const current = await getMonthlyTranscribeCount(userId);
    const limit = Number(PLAN_LIMITS[plan].monthlyTranscribeJobs);
    if (current >= limit) {
      throw new Error(`Bạn đã dùng hết ${limit} video trong tháng cho gói ${plan}.`);
    }
  };

  const incrementMonthlyTranscribeUsage = async (userId: string) => {
    if (isFullTestMode || isLocalDevUser(userId)) return;
    const id = monthlyUsageDocId(userId);
    try {
      await adminDb.collection("usage_monthly").doc(id).set(
        { userId, month: id.slice(userId.length + 1), transcribeJobs: FieldValue.increment(1) },
        { merge: true },
      );
    } catch (error) {
      if (process.env.NODE_ENV !== "production" && isMissingDefaultCredentials(error)) return;
      throw error;
    }
  };

  const isLocalDevUser = (userId: string) => userId === "local-dev-user";
  const isMissingDefaultCredentials = (error: unknown) =>
    String((error as any)?.message || "").toLowerCase().includes("default credentials");

  const readUserBilling = async (userId: string) => {
    if (isLocalDevUser(userId)) {
      return { extraCredits: 999999, overageEnabled: true };
    }
    try {
      const userSnap = await adminDb.collection("users").doc(userId).get();
      const userData = userSnap.exists ? userSnap.data() : {};
      return {
        extraCredits: Number(userData?.extraCredits || 0),
        overageEnabled: Boolean(userData?.overageEnabled),
      };
    } catch (error) {
      if (process.env.NODE_ENV !== "production" && isMissingDefaultCredentials(error)) {
        return { extraCredits: 0, overageEnabled: true };
      }
      throw error;
    }
  };

  const reserveCredits = async (
    userId: string,
    plan: PlanType,
    feature: "aiChat" | "brollAnalysis" | "transcribe" | "export",
    credits: number,
  ) => {
    if (isFullTestMode) return;
    if (isLocalDevUser(userId)) return;
    const creditsToReserve = Math.max(0, Math.ceil(credits));
    if (creditsToReserve <= 0) return;

    const { extraCredits, overageEnabled } = await readUserBilling(userId);
    const monthlyIncluded = Number(PLAN_CREDITS[plan].monthlyIncluded) + Math.max(0, extraCredits);
    const ledgerRef = adminDb.collection("usage_ledger").doc(monthlyLedgerDocId(userId));

    await adminDb.runTransaction(async (tx) => {
      const ledgerSnap = await tx.get(ledgerRef);
      const consumedCredits = Number(ledgerSnap.exists ? ledgerSnap.data()?.consumedCredits || 0 : 0);
      const overageCredits = Number(ledgerSnap.exists ? ledgerSnap.data()?.overageCredits || 0 : 0);
      const nextConsumed = consumedCredits + creditsToReserve;
      const overflow = Math.max(0, nextConsumed - monthlyIncluded);

      if (overflow > 0 && !overageEnabled) {
        throw new Error("Bạn đã hết credits trong tháng. Vui lòng nâng cấp gói hoặc mua thêm credits.");
      }

      tx.set(ledgerRef, {
        userId,
        month: monthlyLedgerDocId(userId).slice(userId.length + 1),
        plan,
        monthlyIncluded,
        consumedCredits: nextConsumed,
        overageCredits: overageCredits + overflow,
        updatedAt: FieldValue.serverTimestamp(),
        featureUsage: {
          [feature]: FieldValue.increment(creditsToReserve),
        },
      }, { merge: true });
    });
  };

  const assertDailyUsage = async (
    userId: string,
    plan: keyof typeof PLAN_LIMITS,
    key: UsageKey,
    limitKey: keyof typeof PLAN_LIMITS["FREE"],
  ) => {
    if (isFullTestMode) return;
    if (isLocalDevUser(userId)) return;
    try {
      const snap = await adminDb.collection("usage").doc(usageDocId(userId)).get();
      const current = Number(snap.exists ? snap.data()?.[key] || 0 : 0);
      const limit = Number(PLAN_LIMITS[plan][limitKey]);
      if (current >= limit) {
        throw new Error(`Bạn đã dùng hết giới hạn hôm nay cho gói ${plan}.`);
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production" && isMissingDefaultCredentials(error)) return;
      throw error;
    }
  };

  const incrementDailyUsage = async (userId: string, key: UsageKey) => {
    if (isFullTestMode) return;
    if (isLocalDevUser(userId)) return;
    const id = usageDocId(userId);
    try {
      await adminDb.collection("usage").doc(id).set({
        userId,
        date: id.slice(userId.length + 1),
        [key]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      if (process.env.NODE_ENV !== "production" && isMissingDefaultCredentials(error)) return;
      throw error;
    }
  };

  const readMonthlyLedger = async (userId: string) => {
    if (isFullTestMode) {
      return { consumedCredits: 0, overageCredits: 0, featureUsage: {} as Record<string, number> };
    }
    if (isLocalDevUser(userId)) {
      return { consumedCredits: 0, overageCredits: 0, featureUsage: {} as Record<string, number> };
    }
    try {
      const ref = adminDb.collection("usage_ledger").doc(monthlyLedgerDocId(userId));
      const snap = await ref.get();
      if (!snap.exists) {
        return { consumedCredits: 0, overageCredits: 0, featureUsage: {} as Record<string, number> };
      }
      const data = snap.data() || {};
      return {
        consumedCredits: Number(data.consumedCredits || 0),
        overageCredits: Number(data.overageCredits || 0),
        featureUsage: (data.featureUsage || {}) as Record<string, number>,
      };
    } catch (error) {
      if (process.env.NODE_ENV !== "production" && isMissingDefaultCredentials(error)) {
        return { consumedCredits: 0, overageCredits: 0, featureUsage: {} as Record<string, number> };
      }
      throw error;
    }
  };

  const normalizePlan = (plan: unknown) => {
    return plan === "BASIC" || plan === "PRO" ? plan : null;
  };

  const heavyApiLimiter = createIpRateLimiter(60, 60_000);

  // Server-side Gemini proxy. Keeps GEMINI_API_KEY out of the browser bundle.
  app.post("/api/ai/chat", heavyApiLimiter, requireFirebaseUserMiddleware, async (req: AuthedRequest, res) => {
    try {
      const userId = req.firebaseUser!.uid;
      const plan = await getUserPlan(userId);
      await assertDailyUsage(userId, plan, "aiChatRequests", "dailyAiChatRequests");

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(401).json({ error: "Chưa cấu hình GEMINI_API_KEY." });
      }

      const { messages = [], message } = req.body;
      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Thiếu nội dung tin nhắn." });
      }
      const historyChars = Array.isArray(messages)
        ? messages.reduce((sum: number, msg: any) => sum + String(msg?.content || "").length, 0)
        : 0;
      const estimatedCredits = FEATURE_CREDIT_COST.aiChatBase
        + Math.ceil((String(message).length + historyChars) / 1000) * FEATURE_CREDIT_COST.aiChatPer1kChars;
      await reserveCredits(userId, plan, "aiChat", estimatedCredits);

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      const safeMessages = Array.isArray(messages) ? messages.slice(-20) : [];

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
        contents: [
          ...safeMessages
            .filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
            .map((m: any) => ({
              role: m.role === "user" ? "user" : "model",
              parts: [{ text: m.content.slice(0, 4000) }]
            })),
          { role: "user", parts: [{ text: message.slice(0, 4000) }] }
        ],
        config: {
          systemInstruction: "Bạn là AI Personal Assistant của ứng dụng EverySunday. EverySunday là công cụ chỉnh sửa video AI chuyên tạo phụ đề viral, tự động chèn B-roll, zoom và cắt im lặng cho TikTok, Reels, Shorts. Trả lời bằng tiếng Việt, ngắn gọn, hữu ích, và hướng dẫn thao tác trong app khi phù hợp."
        }
      });

      await incrementDailyUsage(userId, "aiChatRequests");
      res.json({ text: response.text || "Xin lỗi, tôi không thể trả lời lúc này." });
    } catch (error: any) {
      console.error("Gemini chat failed:", error);
      if (isCreditError(error)) {
        return res.status(402).json({ error: getErrorMessage(error) });
      }
      res.status(500).json({ error: "Không thể kết nối AI assistant lúc này." });
    }
  });

  // Payment requests must go through the server so clients cannot write arbitrary billing records.
  app.post("/api/payment-requests", heavyApiLimiter, async (req, res) => {
    try {
      const decodedToken = await requireFirebaseUser(req);
      const plan = normalizePlan(req.body.plan);
      if (!plan) {
        return res.status(400).json({ error: "Gói thanh toán không hợp lệ." });
      }

      await adminDb.collection("payment_requests").add({
        userId: decodedToken.uid,
        userEmail: decodedToken.email || null,
        plan,
        status: "pending",
        method: "VietQR",
        timestamp: FieldValue.serverTimestamp()
      });

      res.status(201).json({ success: true });
    } catch (error: any) {
      if (error.message === "missing_auth_token" || String(error.code || "").startsWith("auth/")) {
        return res.status(401).json({ error: "Bạn cần đăng nhập để gửi yêu cầu thanh toán." });
      }
      console.error("Payment request failed:", error);
      res.status(500).json({ error: "Không thể ghi nhận yêu cầu thanh toán." });
    }
  });

  app.get("/api/limits/me", requireFirebaseUserMiddleware, async (req: AuthedRequest, res) => {
    try {
      const userId = req.firebaseUser!.uid;
      const plan = await getUserPlan(userId);
      const billing = await readUserBilling(userId);
      const ledger = await readMonthlyLedger(userId);
      const includedCredits = Number(PLAN_CREDITS[plan].monthlyIncluded) + Math.max(0, billing.extraCredits);
      const monthlyTranscribeUsed = await getMonthlyTranscribeCount(userId);
      const todaySnap = await adminDb.collection("usage").doc(usageDocId(userId)).get();
      const todayUsage = todaySnap.exists ? todaySnap.data() : {};
      res.json({
        plan,
        limits: PLAN_LIMITS[plan],
        export: PLAN_EXPORT[plan],
        credits: {
          included: includedCredits,
          consumed: ledger.consumedCredits,
          remaining: Math.max(0, includedCredits - ledger.consumedCredits),
          overageEnabled: billing.overageEnabled,
          overageCredits: ledger.overageCredits,
        },
        usage: {
          monthlyTranscribeJobs: monthlyTranscribeUsed,
          monthlyTranscribeLimit: PLAN_LIMITS[plan].monthlyTranscribeJobs,
          today: {
            transcribeJobs: Number(todayUsage?.transcribeJobs || 0),
            exportJobs: Number(todayUsage?.exportJobs || 0),
          },
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: "Không thể đọc quota hiện tại." });
    }
  });

  app.get("/api/usage/me", requireFirebaseUserMiddleware, async (req: AuthedRequest, res) => {
    try {
      const userId = req.firebaseUser!.uid;
      const todaySnap = await adminDb.collection("usage").doc(usageDocId(userId)).get();
      const todayUsage = todaySnap.exists ? todaySnap.data() : {};
      const ledger = await readMonthlyLedger(userId);
      res.json({
        today: {
          aiChatRequests: Number(todayUsage?.aiChatRequests || 0),
          transcribeJobs: Number(todayUsage?.transcribeJobs || 0),
          exportJobs: Number(todayUsage?.exportJobs || 0),
          brollAnalyses: Number(todayUsage?.brollAnalyses || 0),
          pexelsSearches: Number(todayUsage?.pexelsSearches || 0),
        },
        monthly: {
          consumedCredits: ledger.consumedCredits,
          overageCredits: ledger.overageCredits,
          featureUsage: ledger.featureUsage,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: "Không thể đọc usage hiện tại." });
    }
  });

  // B-roll Keyword Analysis Endpoint
  app.post("/api/analyze-brolls", heavyApiLimiter, requireFirebaseUserMiddleware, async (req: AuthedRequest, res) => {
    try {
      const userId = req.firebaseUser!.uid;
      const plan = await getUserPlan(userId);
      await assertDailyUsage(userId, plan, "brollAnalyses", "dailyBrollAnalyses");

      const { captions } = req.body;
      const openaiKey = process.env.OPENAI_API_KEY;

      if (!Array.isArray(captions) || captions.length === 0) {
        return res.status(400).json({ error: "Thiếu dữ liệu phụ đề." });
      }
      const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
      const normalizeText = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

      const sortedCaps = captions
        .map((c: any, idx: number) => ({
          id: String(c?.id || idx),
          start: Number(c?.start || 0),
          end: Number(c?.end || 0),
          text: normalizeText(c?.text || ""),
          highlight: normalizeText(c?.highlight || ""),
        }))
        .filter((c: any) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start + 0.02)
        .sort((a: any, b: any) => a.start - b.start);

      if (sortedCaps.length === 0) {
        return res.status(400).json({ error: "Dữ liệu phụ đề không hợp lệ." });
      }

      const videoDuration = Math.max(
        sortedCaps[sortedCaps.length - 1].end,
        sortedCaps.reduce((max: number, c: any) => Math.max(max, c.end), 0),
      );
      const minSpacingSec = videoDuration > 180 ? 2.4 : videoDuration > 90 ? 2.2 : 1.8;
      const targetCount = clamp(Math.round(videoDuration / 8), 4, Math.min(24, sortedCaps.length));
      const maxCoverageRatio = 0.35;
      const maxCoverageSeconds = Math.max(6, videoDuration * maxCoverageRatio);

      const heuristicCandidates = sortedCaps.map((cap: any, idx: number) => {
        const capDuration = cap.end - cap.start;
        const words = cap.text.split(/\s+/).filter(Boolean).length;
        const weight = cap.highlight ? 30 : 0;
        const punctuationBoost = /[!?]/.test(cap.text) ? 15 : 0;
        const lengthBoost = words >= 6 ? 10 : 0;
        const positionBoost = idx < 3 ? 12 : 0;
        const score = clamp(45 + weight + punctuationBoost + lengthBoost + positionBoost, 35, 98);
        const rawKeyword = cap.highlight || cap.text.split(/\s+/).slice(0, 4).join(" ");
        return {
          timestamp: cap.start,
          keyword: rawKeyword || "person talking",
          score,
          reason: "Heuristic candidate from transcript rhythm",
        };
      });

      let aiCandidates: any[] = [];
      if (openaiKey) {
        try {
          const estimatedCredits = FEATURE_CREDIT_COST.brollAnalysisBase + Math.ceil(captions.length / 10);
          await reserveCredits(userId, plan, "brollAnalysis", estimatedCredits);

          const { default: OpenAI } = await import("openai");
          const openai = new OpenAI({ apiKey: openaiKey });
          const prompt = `From the transcript with timestamps below, propose B-roll moments for short-form social video.
Return JSON object: {"brolls":[{"timestamp":number,"keyword":"string","score":number,"reason":"string"}]}.
Rules:
- keyword must be in simple English for stock video search.
- score 0-100 for confidence.
- prioritize meaningful transitions/hook/emphasis, avoid every single sentence.
- keep timestamps aligned with transcript starts.

Transcript:
${sortedCaps.map((c: any) => `[${c.start.toFixed(2)}-${c.end.toFixed(2)}] ${c.text}`).join("\n")}`;

          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "Output strictly valid JSON only." },
              { role: "user", content: prompt },
            ],
          });
          const text = response.choices[0].message.content || "{}";
          const parsed = JSON.parse(text);
          aiCandidates = Array.isArray(parsed?.brolls) ? parsed.brolls : [];
        } catch (aiError) {
          console.warn("AI b-roll analysis failed, fallback to heuristic plan.", aiError);
          aiCandidates = [];
        }
      }

      const mergedCandidates = (aiCandidates.length > 0 ? aiCandidates : heuristicCandidates)
        .map((c: any) => {
          const ts = Number(c?.timestamp || 0);
          const nearest = sortedCaps.reduce((best: any, cur: any) => {
            return Math.abs(cur.start - ts) < Math.abs(best.start - ts) ? cur : best;
          }, sortedCaps[0]);
          const baseDuration = clamp((nearest.end - nearest.start) * 0.8, 1.2, 3.4);
          return {
            timestamp: clamp(nearest.start, 0, Math.max(0, videoDuration - 0.2)),
            keyword: String(c?.keyword || nearest.highlight || nearest.text || "person talking").trim().toLowerCase(),
            score: clamp(Number(c?.score || 60), 1, 100),
            reason: String(c?.reason || "Matched transcript segment"),
            duration: baseDuration,
          };
        })
        .filter((c: any) => c.keyword.length > 1)
        .sort((a: any, b: any) => b.score - a.score);

      const uniqueByKeywordAndTime: any[] = [];
      for (const item of mergedCandidates) {
        const duplicate = uniqueByKeywordAndTime.some((x) => x.keyword === item.keyword && Math.abs(x.timestamp - item.timestamp) < 0.6);
        if (!duplicate) uniqueByKeywordAndTime.push(item);
      }

      const rhythmPlan: any[] = [];
      let lastTs = -999;
      let covered = 0;
      for (const item of uniqueByKeywordAndTime) {
        if (rhythmPlan.length >= targetCount) break;
        if ((item.timestamp - lastTs) < minSpacingSec) continue;
        if (covered + item.duration > maxCoverageSeconds) continue;
        rhythmPlan.push(item);
        covered += item.duration;
        lastTs = item.timestamp;
      }

      const brolls = rhythmPlan
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((item, index) => ({
          id: `auto_${index}_${Math.round(item.timestamp * 100)}`,
          timestamp: Number(item.timestamp.toFixed(2)),
          keyword: item.keyword,
          duration: Number(item.duration.toFixed(2)),
          score: Math.round(item.score),
          reason: item.reason,
        }));

      await incrementDailyUsage(userId, "brollAnalyses");
      return res.json({
        brolls,
        meta: {
          source: aiCandidates.length > 0 ? "ai+rhythm" : "heuristic+rhythm",
          targetCount,
          appliedCount: brolls.length,
          minSpacingSec,
          maxCoverageSeconds: Number(maxCoverageSeconds.toFixed(2)),
        },
      });
    } catch (error: any) {
      console.error("OpenAI B-roll extraction failed:", error);
      if (isLimitError(error)) {
        return res.status(429).json({ error: getErrorMessage(error) });
      }
      let msg = getErrorMessage(error) || "Lỗi sự cố máy chủ.";
      if (msg.includes("credits")) {
        return res.status(402).json({ error: msg });
      }
      if (msg.includes("429") || msg.includes("quota")) {
        msg = "LỖI OPENAI QUOTA: Tài khoản OpenAI của bạn đã hết hạn mức.";
        return res.status(429).json({ error: msg });
      }
      res.status(500).json({ error: "Không thể phân tích B-roll lúc này." });
    }
  });

  // Pexels Proxy Route
  const pexelsCache = new Map<string, { data: any; expiresAt: number }>();
  app.get("/api/pexels/search", heavyApiLimiter, requireFirebaseUserMiddleware, async (req: AuthedRequest, res) => {
    try {
      const userId = req.firebaseUser!.uid;
      const plan = await getUserPlan(userId);
      await assertDailyUsage(userId, plan, "pexelsSearches", "dailyPexelsSearches");

      const { query, per_page = 5 } = req.query;
      const apiKey = process.env.PEXELS_API_KEY;

      if (!apiKey) {
        return res.status(401).json({ error: "Chưa cấu hình PEXELS_API_KEY." });
      }

      if (!query) {
        return res.status(400).json({ error: "Thiếu từ khóa tìm kiếm." });
      }
      const cacheKey = `${String(query).trim().toLowerCase()}_${String(per_page)}`;
      const cached = pexelsCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        await incrementDailyUsage(userId, "pexelsSearches");
        return res.json(cached.data);
      }

      const response = await axios.get(`https://api.pexels.com/videos/search`, {
        params: { query, per_page, orientation: "portrait" },
        headers: { Authorization: apiKey }
      });

      pexelsCache.set(cacheKey, { data: response.data, expiresAt: Date.now() + 10 * 60 * 1000 });
      await incrementDailyUsage(userId, "pexelsSearches");
      res.json(response.data);
    } catch (error: any) {
      console.error("Pexels API Error:", error.response?.data || getErrorMessage(error));
      if (isLimitError(error)) {
        return res.status(429).json({ error: getErrorMessage(error) });
      }
      res.status(error.response?.status || 500).json({ error: "Lỗi khi tìm kiếm video trên Pexels." });
    }
  });

  // --- SePay Webhook Endpoint ---
  app.post("/api/webhooks/sepay", async (req, res) => {
    try {
      const apiKey = process.env.SEPAY_API_KEY;
      const authHeader = req.headers.authorization;

      if (apiKey && authHeader !== `Apikey ${apiKey}` && authHeader !== `Bearer ${apiKey}`) {
        return res.status(401).json({ error: "Unauthorized. Invalid SEPAY_API_KEY." });
      }

      // Expected body shape from SePay: { id, gateway, transferAmount, content, transferType, ... }
      const { transferAmount, content, transferType } = req.body;
      
      console.log(`[SePay Webhook] Received: Amount=${transferAmount}, Content=${content}`);

      if (transferType !== "in" && transferAmount > 0) {
        return res.status(200).json({ status: "ignored_not_in_type" });
      }

      if (!content || typeof content !== "string") {
        return res.status(200).json({ status: "ignored_no_content" });
      }

      const upperContent = content.toUpperCase();
      if (!upperContent.includes("SNAP")) {
        return res.status(200).json({ status: "ignored_invalid_prefix" });
      }

      // Extract username string: e.g. "SNAP TUANNGUYENANH" -> "TUANNGUYENANH"
      const contentParts = upperContent.split("SNAP");
      const emailPrefix = contentParts[1]?.trim().split(" ")[0]?.toLowerCase();

      if (!emailPrefix) {
        return res.status(400).json({ status: "ignored_no_email_prefix" });
      }

      console.log(`[SePay Webhook] Looking for user with email starting with: ${emailPrefix}`);

      // Query adminDb for a user with the matching email
      const usersSnapshot = await adminDb.collection("users").get();
      let matchedUserId = null;
      let matchedEmail = null;

      usersSnapshot.forEach((doc) => {
        const uEmail = doc.data().email?.toLowerCase();
        if (uEmail && uEmail.split("@")[0] === emailPrefix) {
          matchedUserId = doc.id;
          matchedEmail = uEmail;
        }
      });

      if (!matchedUserId) {
        console.warn(`[SePay Webhook] No user found for email prefix: ${emailPrefix}`);
        return res.status(404).json({ status: "user_not_found" });
      }

      // Determine plan based on amount (Assume 90k+ = Basic, 190k+ = Pro)
      let planToGrant = "BASIC";
      if (transferAmount >= 190000) {
        planToGrant = "PRO";
      }

      console.log(`[SePay Webhook] Upgrading user ${matchedEmail} to ${planToGrant}`);

      await adminDb.collection("users").doc(matchedUserId).update({
        plan: planToGrant
      });

      // Optionally log success to `payment_requests`
      await adminDb.collection("payment_requests").add({
        userId: matchedUserId,
        userEmail: matchedEmail,
        plan: planToGrant,
        amount: transferAmount,
        method: 'SePay_Webhook',
        status: 'approved',
        timestamp: FieldValue.serverTimestamp()
      });

      res.status(200).json({ success: true, message: `Upgraded ${matchedEmail} to ${planToGrant}` });
    } catch (err: any) {
      console.error("[SePay Webhook Error]", err);
      res.status(500).json({ error: "Webhook thanh toán lỗi, vui lòng thử lại sau." });
    }
  });

  // --- Durable Job State ---
  interface JobRecord {
    id: string;
    userId?: string;
    status: string;
    progress: number;
    result?: any;
    error?: string;
    queuePosition?: number;
    kind?: "transcribe" | "export";
    createdAt?: number;
    updatedAt?: number;
  }
  const jobs = new Map<string, JobRecord>();
  const maxWorkerConcurrency = Math.max(1, Number(process.env.JOB_WORKER_CONCURRENCY || 1));
  const jobQueue = createJobQueue();
  let runningWorkers = 0;
  type JobKind = "transcribe" | "export";
  interface JobFailureEvent {
    jobId: string;
    kind: JobKind;
    userId?: string;
    attempt: number;
    maxAttempts: number;
    reason: string;
    at: number;
  }
  const MAX_FAILURE_EVENTS = 80;
  const monitor = {
    transcribe: { success: 0, failure: 0, retries: 0, totalAttempts: 0, recentFailures: [] as JobFailureEvent[] },
    export: { success: 0, failure: 0, retries: 0, totalAttempts: 0, recentFailures: [] as JobFailureEvent[] },
  };
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const getMaxAttempts = (kind: JobKind) => {
    const fromEnv = Number(
      kind === "transcribe"
        ? process.env.TRANSCRIBE_MAX_ATTEMPTS || 3
        : process.env.EXPORT_MAX_ATTEMPTS || 3
    );
    return Math.max(1, Math.min(6, Number.isFinite(fromEnv) ? fromEnv : 3));
  };
  const backoffDelayMs = (kind: JobKind, attempt: number) => {
    const base = kind === "transcribe" ? 1500 : 2200;
    const maxDelay = kind === "transcribe" ? 15000 : 22000;
    const jitter = Math.floor(Math.random() * 600);
    return Math.min(maxDelay, base * Math.pow(2, Math.max(0, attempt - 1)) + jitter);
  };
  const normalizeErrorReason = (error: any) => {
    const msg = String(error?.message || error || "Unknown worker error").replace(/\s+/g, " ").trim();
    return msg.slice(0, 360);
  };
  const isRetryableJobError = (error: any) => {
    const code = String(error?.code || "").toLowerCase();
    const message = normalizeErrorReason(error).toLowerCase();
    const nonRetryablePatterns = [
      "api key",
      "api_key_invalid",
      "insufficient_quota",
      "lỗi openai quota",
      "unauthorized",
      "forbidden",
      "missing_auth_token",
      "hết credits",
      "vượt giới hạn",
      "not found",
      "không hợp lệ",
    ];
    if (nonRetryablePatterns.some((pattern) => message.includes(pattern))) return false;

    const retryableCodes = ["econnreset", "etimedout", "eai_again", "ecanceled", "enotfound"];
    if (retryableCodes.includes(code)) return true;

    const retryablePatterns = [
      "timeout",
      "timed out",
      "socket hang up",
      "network",
      "temporarily unavailable",
      "rate limit",
      "status code 429",
      "status code 500",
      "status code 502",
      "status code 503",
      "status code 504",
      "connection reset",
    ];
    return retryablePatterns.some((pattern) => message.includes(pattern));
  };
  const recordJobRetry = (kind: JobKind) => {
    monitor[kind].retries += 1;
  };
  const recordJobFinal = (
    kind: JobKind,
    success: boolean,
    attempts: number,
    event?: JobFailureEvent,
  ) => {
    monitor[kind].totalAttempts += attempts;
    if (success) {
      monitor[kind].success += 1;
      return;
    }
    monitor[kind].failure += 1;
    if (event) {
      monitor[kind].recentFailures.unshift(event);
      if (monitor[kind].recentFailures.length > MAX_FAILURE_EVENTS) {
        monitor[kind].recentFailures.length = MAX_FAILURE_EVENTS;
      }
    }
  };

  const persistJob = (job: JobRecord) => {
    const now = Date.now();
    const previous: Partial<JobRecord> = jobs.get(job.id) || {};
    const nextJob = Object.fromEntries(
      Object.entries({ ...previous, ...job, updatedAt: now, createdAt: job.createdAt || previous.createdAt || now })
        .filter(([, value]) => value !== undefined)
    ) as JobRecord;
    jobs.set(job.id, nextJob);

    adminDb.collection("jobs").doc(job.id).set(nextJob, { merge: true }).catch((error) => {
      console.warn(`[Job ${job.id}] Could not persist job status to Firestore:`, error.message);
    });
  };

  const readJob = async (jobId: string) => {
    const memoryJob = jobs.get(jobId);
    if (memoryJob) return memoryJob;

    try {
      const snap = await adminDb.collection("jobs").doc(jobId).get();
      return snap.exists ? snap.data() as JobRecord : null;
    } catch (error: any) {
      console.warn(`[Job ${jobId}] Could not read job status from Firestore:`, error.message);
      return null;
    }
  };

  const enqueueJob = async (task: QueuedTask) => {
    await jobQueue.enqueue(task);
    const depth = await jobQueue.size();
    persistJob({
      id: task.jobId,
      userId: task.userId,
      kind: task.kind,
      status: "queued",
      progress: 0,
      queuePosition: depth,
    });
    if (shouldRunInlineWorkers()) {
      void maybeRunWorkers();
    }
  };

  const MEDIA_PROBE_TIMEOUT_MS = 15_000;

  const ffprobeWithTimeout = async (filePath: string, timeoutMs = MEDIA_PROBE_TIMEOUT_MS) => {
    return await new Promise<any>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`ffprobe timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      ffmpeg.ffprobe(filePath, (err, data) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (err) reject(err);
        else resolve(data);
      });
    });
  };

  const getMediaDuration = async (filePath: string) => {
    try {
      const metadata: any = await ffprobeWithTimeout(filePath);
      return Number(metadata?.format?.duration || 0);
    } catch {
      const fallback = await probeMediaWithFfmpeg(filePath);
      return Number(fallback.duration || 0);
    }
  };

  const getVideoMetadata = async (filePath: string) => {
    try {
      const metadata: any = await ffprobeWithTimeout(filePath);
      const videoStream = metadata?.streams?.find((stream: any) => stream.codec_type === "video");
      const audioStream = metadata?.streams?.find((stream: any) => stream.codec_type === "audio");
      return {
        duration: Number(metadata?.format?.duration || 0),
        width: Number(videoStream?.width || 1080),
        height: Number(videoStream?.height || 1920),
        hasAudio: Boolean(audioStream),
      };
    } catch {
      return probeMediaWithFfmpeg(filePath);
    }
  };

  const probeMediaWithFfmpeg = async (filePath: string, timeoutMs = MEDIA_PROBE_TIMEOUT_MS) => {
    return await new Promise<{ duration: number; width: number; height: number; hasAudio: boolean }>((resolve, reject) => {
      const child = spawn(ffmpegInstaller.path, ["-i", filePath], { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(new Error(`ffmpeg probe timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      child.stdout.on("data", (chunk) => { output += chunk.toString(); });
      child.stderr.on("data", (chunk) => { output += chunk.toString(); });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const durationMatch = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i);
        const videoMatch = output.match(/Video:.*?(\d{2,5})x(\d{2,5})/i);
        const hasAudio = /Audio:/i.test(output);

        const hours = durationMatch ? Number(durationMatch[1]) : 0;
        const minutes = durationMatch ? Number(durationMatch[2]) : 0;
        const seconds = durationMatch ? Number(durationMatch[3]) : 0;
        const duration = (hours * 3600) + (minutes * 60) + seconds;
        const width = videoMatch ? Number(videoMatch[1]) : 1080;
        const height = videoMatch ? Number(videoMatch[2]) : 1920;

        resolve({ duration, width, height, hasAudio });
      });
    });
  };

  const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return fallback;
    return Math.max(min, Math.min(max, numberValue));
  };

  const normalizeHexColor = (value: unknown, fallback: string) => {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
  };

  const hexToAssColor = (hex: string) => {
    const safe = normalizeHexColor(hex, "#ffffff").slice(1);
    const rr = safe.slice(0, 2);
    const gg = safe.slice(2, 4);
    const bb = safe.slice(4, 6);
    return `&H00${bb}${gg}${rr}`;
  };

  const escapeAssText = (text: unknown) => {
    return String(text || "")
      .replace(/\\/g, "\\\\")
      .replace(/\{/g, "\\{")
      .replace(/\}/g, "\\}")
      .replace(/\r?\n/g, "\\N");
  };

  const formatAssTime = (timeSeconds: number) => {
    const totalCentiseconds = Math.max(0, Math.round(timeSeconds * 100));
    const cs = totalCentiseconds % 100;
    const totalSeconds = Math.floor(totalCentiseconds / 100);
    const ss = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const mm = totalMinutes % 60;
    const hh = Math.floor(totalMinutes / 60);
    return `${hh}:${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
  };

  interface ExportCustomTextOverlay {
    id?: string;
    text?: string;
    start?: number;
    end?: number;
    positionX?: number;
    positionY?: number;
    fontSize?: number;
    color?: string;
    fontWeight?: string | number;
    fontFamily?: string;
    strokeWidth?: number;
    strokeColor?: string;
    shadowBlur?: number;
    shadowColor?: string;
    uppercase?: boolean;
    characterSpacing?: number;
    fontSpacing?: number;
    animationPreset?: string;
    entryDurationMs?: number;
    fadeOutDurationMs?: number;
    translateYFromPx?: number;
    scaleFrom?: number;
    horizontalAnchor?: "left" | "center" | "right";
  }

  interface ExportVideoAdjustments {
    exp?: number;
    sat?: number;
    tint?: number;
    contrast?: number;
    shadow?: number;
    light?: number;
    white?: number;
    black?: number;
    vibrance?: number;
    temp?: number;
  }

  const normalizeVideoAdjustments = (value: any): Required<ExportVideoAdjustments> => {
    const clampAdj = (v: unknown) => clampNumber(v, 0, -100, 100);
    return {
      exp: clampAdj(value?.exp),
      sat: clampAdj(value?.sat),
      tint: clampAdj(value?.tint),
      contrast: clampAdj(value?.contrast),
      shadow: clampAdj(value?.shadow),
      light: clampAdj(value?.light),
      white: clampAdj(value?.white),
      black: clampAdj(value?.black),
      vibrance: clampAdj(value?.vibrance),
      temp: clampAdj(value?.temp),
    };
  };

  const buildVideoAdjustmentFilter = (adjustments: Required<ExportVideoAdjustments>) => {
    const brightness = Math.max(-0.4, Math.min(0.4, (adjustments.exp * 0.003) + (adjustments.light * 0.0025) + (adjustments.white * 0.0018) - (adjustments.black * 0.0018)));
    const contrast = Math.max(0.4, Math.min(1.8, 1 + (adjustments.contrast * 0.006)));
    const saturation = Math.max(0, Math.min(2.4, 1 + ((adjustments.sat + adjustments.vibrance * 0.6) * 0.006)));
    const gamma = Math.max(0.6, Math.min(1.8, 1 + (adjustments.shadow * -0.003)));

    const tempOffset = Math.max(-1, Math.min(1, adjustments.temp / 100));
    const tintOffset = Math.max(-1, Math.min(1, adjustments.tint / 100));
    const rs = Math.max(-1, Math.min(1, tempOffset * -0.4 + tintOffset * 0.25));
    const bs = Math.max(-1, Math.min(1, tempOffset * 0.4 - tintOffset * 0.25));

    return `eq=brightness=${brightness.toFixed(4)}:contrast=${contrast.toFixed(4)}:saturation=${saturation.toFixed(4)}:gamma=${gamma.toFixed(4)},colorbalance=rs=${rs.toFixed(3)}:bs=${bs.toFixed(3)}`;
  };

  const isNeutralVideoAdjustments = (adjustments: Required<ExportVideoAdjustments>) => {
    return Object.values(adjustments).every((value) => Math.abs(Number(value || 0)) < 0.0001);
  };

  const selectEncoderPreset = (opts: {
    duration: number;
    keepSegments: number;
    zoomCount: number;
    brollCount: number;
    hasText: boolean;
    hasAdjustments: boolean;
  }) => {
    const { duration, keepSegments, zoomCount, brollCount, hasText, hasAdjustments } = opts;
    const complexity =
      (duration > 90 ? 2 : 0) +
      (duration > 180 ? 2 : 0) +
      Math.min(4, Math.floor(keepSegments / 20)) +
      Math.min(3, Math.floor(zoomCount / 10)) +
      Math.min(3, brollCount) +
      (hasText ? 2 : 0) +
      (hasAdjustments ? 1 : 0);
    if (complexity >= 8) return "superfast";
    if (complexity >= 4) return "veryfast";
    return "faster";
  };

  const resolveTransitionConfig = (transitionType: string | undefined) => {
    const t = String(transitionType || "GLARE_SWEEP").toUpperCase();
    switch (t) {
      case "CUT":
        return { xfade: "fade", duration: 0, brollFade: 0 };
      case "FADE":
        return { xfade: "fade", duration: 0.25, brollFade: 0.2 };
      case "DISSOLVE":
        return { xfade: "dissolve", duration: 0.28, brollFade: 0.22 };
      case "WIPE_LEFT":
        return { xfade: "wipeleft", duration: 0.3, brollFade: 0.2 };
      case "WIPE_RIGHT":
        return { xfade: "wiperight", duration: 0.3, brollFade: 0.2 };
      case "SLIDE_LEFT":
        return { xfade: "slideleft", duration: 0.3, brollFade: 0.2 };
      case "SLIDE_RIGHT":
        return { xfade: "slideright", duration: 0.3, brollFade: 0.2 };
      case "ZOOM_IN":
        return { xfade: "zoomin", duration: 0.28, brollFade: 0.2 };
      case "ZOOM_OUT":
        return { xfade: "fade", duration: 0.28, brollFade: 0.2 };
      case "LIGHT_LEAK":
        return { xfade: "fade", duration: 0.4, brollFade: 0.34 };
      case "DIP_TO_WHITE":
        return { xfade: "fadewhite", duration: 0.22, brollFade: 0.2 };
      case "BLOOM_BURST":
        return { xfade: "fade", duration: 0.24, brollFade: 0.22 };
      case "GLARE_SWEEP":
      default:
        return { xfade: "fadewhite", duration: 0.3, brollFade: 0.3 };
    }
  };

  const escapeFfmpegExpr = (expr: string) => expr.replace(/,/g, "\\,");

  const buildAssSubtitles = (
    captions: any[],
    captionSettings: any = {},
    styleId: string = "iman",
    videoSize: { width: number; height: number },
    customTextOverlays: ExportCustomTextOverlay[] = [],
  ) => {
    const fontFamily = typeof captionSettings.fontFamily === "string" ? captionSettings.fontFamily : "Montserrat";
    const fontSize = Math.round(clampNumber(captionSettings.fontSize, styleId === "bob" ? 51 : 48, 12, 96));
    const fontWeight = Number(captionSettings.fontWeight) >= 700 ? -1 : 0;
    const primaryColor = hexToAssColor(normalizeHexColor(captionSettings.primaryColor, "#ffffff"));
    const secondaryColor = hexToAssColor(normalizeHexColor(captionSettings.secondColor, "#FFD700"));
    const outlineColor = hexToAssColor(normalizeHexColor(captionSettings.strokeColor, "#000000"));
    const outline = clampNumber(captionSettings.strokeWidth, 2, 0, 8);
    const shadow = clampNumber(captionSettings.shadowBlur, 4, 0, 10) > 0 ? Math.min(4, clampNumber(captionSettings.shadowBlur, 4, 0, 10) / 2) : 0;
    const positionX = Math.round(videoSize.width * clampNumber(captionSettings.positionX, 50, 0, 100) / 100);
    const positionY = Math.round(videoSize.height * clampNumber(captionSettings.positionY, 70, 0, 100) / 100);
    const displayWords = Math.round(clampNumber(captionSettings.displayWords, 100, 1, 30));
    const uppercase = Boolean(captionSettings.uppercase);
    const punctuation = captionSettings.punctuation !== false;
    const breakLines = captionSettings.breakLines !== false;

    const scriptInfo = [
      "[Script Info]",
      "ScriptType: v4.00+",
      `PlayResX: ${videoSize.width}`,
      `PlayResY: ${videoSize.height}`,
      "ScaledBorderAndShadow: yes",
      "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      `Style: Default,${fontFamily},${fontSize},${primaryColor},${secondaryColor},${outlineColor},&H80000000,${fontWeight},0,0,0,100,100,0,0,1,${outline},${shadow},5,20,20,20,1`,
      "",
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ];

    const events = captions.map((caption: any) => {
      let text = String(caption.text || "");
      if (!punctuation) text = text.replace(/[.,!?;:]/g, "");
      const words = text.trim().split(/\s+/).filter(Boolean);
      if (words.length > displayWords) text = words.slice(0, displayWords).join(" ");
      if (breakLines && words.length > 3) {
        const visibleWords = text.trim().split(/\s+/).filter(Boolean);
        const midpoint = Math.ceil(visibleWords.length / 2);
        text = `${visibleWords.slice(0, midpoint).join(" ")}\\N${visibleWords.slice(midpoint).join(" ")}`;
      }
      if (uppercase) text = text.toUpperCase();
      text = escapeAssText(text);

      const highlight = String(caption.highlight || "").replace(/[.,!?;:]/g, "").trim();
      if (highlight && styleId !== "iman2") {
        const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        text = text.replace(new RegExp(`\\b(${escapedHighlight})\\b`, "i"), `{\\c${secondaryColor}}$1{\\c${primaryColor}}`);
      }

      return `Dialogue: 0,${formatAssTime(Number(caption.start || 0))},${formatAssTime(Number(caption.end || 0))},Default,,0,0,0,,{\\pos(${positionX},${positionY})}${text}`;
    });

    const customEvents = customTextOverlays
      .map((item) => {
        const textRaw = String(item?.text || "").trim();
        if (!textRaw) return null;
        const start = clampNumber(item?.start, 0, 0, 60 * 60 * 2);
        const end = clampNumber(item?.end, start + 2, 0, 60 * 60 * 2);
        if (end <= start + 0.02) return null;
        const posX = Math.round(videoSize.width * clampNumber(item?.positionX, 50, 0, 100) / 100);
        const posY = Math.round(videoSize.height * clampNumber(item?.positionY, 20, 0, 100) / 100);
        const fontSizeOverlay = Math.round(clampNumber(item?.fontSize, 56, 12, 180));
        const primaryOverlay = hexToAssColor(normalizeHexColor(item?.color, "#ffffff"));
        const outlineOverlay = hexToAssColor(normalizeHexColor(item?.strokeColor, "#000000"));
        const shadowColorOverlay = hexToAssColor(normalizeHexColor(item?.shadowColor, "#000000"));
        const outlineWidth = clampNumber(item?.strokeWidth, 0, 0, 10);
        const shadowBlur = clampNumber(item?.shadowBlur, 6, 0, 20);
        const shadow = shadowBlur > 0 ? Math.min(8, shadowBlur / 2) : 0;
        const charSpacing = clampNumber(item?.characterSpacing, 0, -4, 24);
        const bold = Number(item?.fontWeight) >= 700 ? -1 : 0;
        const fontName = typeof item?.fontFamily === "string" ? item.fontFamily : fontFamily;
        const text = escapeAssText(item?.uppercase ? textRaw.toUpperCase() : textRaw);
        const animationPreset = String(item?.animationPreset || "none");
        const entryDurationMs = Math.round(clampNumber(item?.entryDurationMs, 220, 60, 800));
        const fadeOutDurationMs = Math.round(clampNumber(item?.fadeOutDurationMs, 180, 80, 1200));
        const translateYFromPx = clampNumber(item?.translateYFromPx, 12, -120, 120);
        const scaleFrom = clampNumber(item?.scaleFrom, 0.98, 0.5, 1.4);
        const horizontalAnchor = String(item?.horizontalAnchor || "center").toLowerCase();
        const alignmentTag = horizontalAnchor === "left" ? 7 : horizontalAnchor === "right" ? 9 : 8;
        let animationTags = "";
        if (animationPreset === "subtle_in" || animationPreset === "slide_up" || animationPreset === "slide_down") {
          const sign = animationPreset === "slide_down" ? -1 : 1;
          const startY = Math.round(posY + (translateYFromPx * sign));
          const scaleFromPct = Math.round(scaleFrom * 100);
          animationTags = `\\move(${posX},${startY},${posX},${posY},0,${entryDurationMs})\\fad(${entryDurationMs},${fadeOutDurationMs})\\fscx${scaleFromPct}\\fscy${scaleFromPct}\\t(0,${entryDurationMs},\\fscx100\\fscy100)`;
        } else if (animationPreset === "fade_in" || animationPreset === "typewriter") {
          animationTags = `\\fad(${entryDurationMs},${fadeOutDurationMs})`;
        } else if (animationPreset === "fade_out") {
          animationTags = `\\fad(0,${entryDurationMs})`;
        }
        const styleTag = `{\\fn${fontName}\\fs${fontSizeOverlay}\\c${primaryOverlay}\\3c${outlineOverlay}\\4c${shadowColorOverlay}\\bord${outlineWidth}\\shad${shadow}\\b${bold}\\fsp${charSpacing}\\an${alignmentTag}\\pos(${posX},${posY})${animationTags}}`;
        return `Dialogue: 5,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${styleTag}${text}`;
      })
      .filter(Boolean) as string[];

    return [...scriptInfo, ...events, ...customEvents].join("\n");
  };

  interface TimeSegment {
    start: number;
    end: number;
  }

  const normalizeSilenceSegments = (segments: any[], duration: number): TimeSegment[] => {
    if (!Array.isArray(segments) || duration <= 0) return [];
    const clamped = segments
      .map((segment) => ({
        start: clampNumber(segment?.start, 0, 0, duration),
        end: clampNumber(segment?.end, 0, 0, duration),
      }))
      .filter((segment) => segment.end - segment.start >= 0.08)
      .sort((a, b) => a.start - b.start);

    const merged: TimeSegment[] = [];
    for (const segment of clamped) {
      const last = merged[merged.length - 1];
      if (!last || segment.start > last.end + 0.02) {
        merged.push({ ...segment });
        continue;
      }
      last.end = Math.max(last.end, segment.end);
    }
    return merged;
  };

  const medianValue = (values: number[]) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  };

  const countWords = (text: unknown) => String(text || "").trim().split(/\s+/).filter(Boolean).length;
  const normalizeToken = (value: string) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const FILLER_WORDS = new Set([
    "a", "uh", "um", "erm", "ah", "eh", "mm", "hmm", "ok", "okay",
    "thi", "la", "ma", "nhe", "nha", "u", "e", "ha", "oi",
  ]);
  const isLowValueCaption = (text: string, duration: number, prevText: string, nextText: string) => {
    const tokens = String(text || "").split(/\s+/).map(normalizeToken).filter(Boolean);
    if (tokens.length === 0) return true;
    const unique = new Set(tokens);
    const normalized = tokens.join(" ");
    const prevNormalized = String(prevText || "").split(/\s+/).map(normalizeToken).filter(Boolean).join(" ");
    const nextNormalized = String(nextText || "").split(/\s+/).map(normalizeToken).filter(Boolean).join(" ");
    const mostlyFiller = tokens.length <= 3 && tokens.every((t) => FILLER_WORDS.has(t));
    const heavyRepeat = tokens.length >= 2 && unique.size <= Math.max(1, Math.floor(tokens.length * 0.45));
    const nearDuplicate = Boolean(normalized && (normalized === prevNormalized || normalized === nextNormalized));
    const shortFragment = duration <= 0.55 && tokens.length <= 3;
    return mostlyFiller || (shortFragment && heavyRepeat) || (shortFragment && nearDuplicate);
  };

  const capSilencesByBudget = (segments: TimeSegment[], duration: number, maxCutRatio: number) => {
    const budget = Math.max(0, duration * maxCutRatio);
    const total = segments.reduce((acc, segment) => acc + (segment.end - segment.start), 0);
    if (total <= budget) return segments;

    let used = 0;
    return [...segments]
      .sort((a, b) => (b.end - b.start) - (a.end - a.start))
      .filter((segment) => {
        const len = segment.end - segment.start;
        if (used + len > budget) return false;
        used += len;
        return true;
      })
      .sort((a, b) => a.start - b.start);
  };

  const buildKeepSegments = (silenceSegments: TimeSegment[], duration: number): TimeSegment[] => {
    if (duration <= 0) return [];
    if (silenceSegments.length === 0) return [{ start: 0, end: duration }];
    const keep: TimeSegment[] = [];
    let cursor = 0;
    for (const silence of silenceSegments) {
      if (silence.start > cursor + 0.02) {
        keep.push({ start: cursor, end: silence.start });
      }
      cursor = Math.max(cursor, silence.end);
    }
    if (cursor < duration - 0.02) {
      keep.push({ start: cursor, end: duration });
    }
    return keep.filter((segment) => segment.end - segment.start >= 0.05);
  };

  const detectSilenceSegmentsFromCaptions = (
    captions: any[],
    duration: number,
  ): TimeSegment[] => {
    if (!Array.isArray(captions) || captions.length === 0 || duration <= 0) return [];
    const sorted = captions
      .map((caption) => ({
        start: clampNumber(caption?.start, 0, 0, duration),
        end: clampNumber(caption?.end, 0, 0, duration),
        text: String(caption?.text || ""),
      }))
      .filter((caption) => caption.end > caption.start)
      .sort((a, b) => a.start - b.start);

    if (sorted.length === 0) return [];

    const gaps: number[] = [];
    const speechRates: number[] = [];
    let cursorForStats = 0;
    for (const caption of sorted) {
      gaps.push(Math.max(0, caption.start - cursorForStats));
      const capDuration = Math.max(0.15, caption.end - caption.start);
      speechRates.push(countWords(caption.text) / capDuration);
      cursorForStats = Math.max(cursorForStats, caption.end);
    }
    gaps.push(Math.max(0, duration - cursorForStats));

    const medianGap = medianValue(gaps.filter((gap) => gap > 0.02));
    const medianSpeechRate = medianValue(speechRates.filter((rate) => Number.isFinite(rate) && rate > 0));
    const paceBias = clampNumber((medianSpeechRate - 2.2) * 0.08, 0, -0.06, 0.10);
    const paddingSeconds = clampNumber((medianGap * 0.15 || 0.08) + paceBias, 0.07, 0.03, 0.16);
    const minGapSeconds = clampNumber((medianGap * 0.62 || 0.24) + paceBias, 0.18, 0.10, 0.85);
    const minKeepDuration = clampNumber(0.15 + (medianGap * 0.15), 0.2, 0.15, 0.35);
    const maxCutRatio = 0.48;

    const silenceSegments: TimeSegment[] = [];
    let cursor = 0;

    for (const caption of sorted) {
      const silenceStart = Math.max(0, cursor + paddingSeconds);
      const silenceEnd = Math.max(0, caption.start - paddingSeconds);
      if (silenceEnd - silenceStart >= minGapSeconds) {
        silenceSegments.push({ start: silenceStart, end: silenceEnd });
      }
      cursor = Math.max(cursor, caption.end);
    }

    const tailStart = Math.max(0, cursor + paddingSeconds);
    if (duration - tailStart >= minGapSeconds) {
      silenceSegments.push({ start: tailStart, end: duration });
    }

    const rhythmCutSegments: TimeSegment[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const caption = sorted[i];
      const capDuration = Math.max(0.01, caption.end - caption.start);
      const prevText = i > 0 ? sorted[i - 1].text : "";
      const nextText = i < sorted.length - 1 ? sorted[i + 1].text : "";
      if (!isLowValueCaption(caption.text, capDuration, prevText, nextText)) continue;
      const guard = Math.min(0.08, capDuration * 0.2);
      const cutStart = clampNumber(caption.start + guard, 0, 0, duration);
      const cutEnd = clampNumber(caption.end - guard, 0, 0, duration);
      if (cutEnd - cutStart >= 0.08) {
        rhythmCutSegments.push({ start: cutStart, end: cutEnd });
      }
    }

    const merged = normalizeSilenceSegments([...silenceSegments, ...rhythmCutSegments], duration);
    const smoothed: TimeSegment[] = [];
    for (const segment of merged) {
      const last = smoothed[smoothed.length - 1];
      if (!last || segment.start > last.end + minKeepDuration) {
        smoothed.push({ ...segment });
      } else {
        last.end = Math.max(last.end, segment.end);
      }
    }

    return capSilencesByBudget(
      smoothed.filter((segment) => segment.end - segment.start >= 0.08),
      duration,
      maxCutRatio,
    );
  };

  const detectSilenceSegmentsFromWordTimings = (
    words: Array<{ start?: number; end?: number; word?: string }>,
    duration: number,
  ): TimeSegment[] => {
    if (!Array.isArray(words) || words.length === 0 || duration <= 0) return [];
    const sorted = words
      .map((word) => ({
        start: clampNumber(word?.start, 0, 0, duration),
        end: clampNumber(word?.end, 0, 0, duration),
        text: String(word?.word || ""),
      }))
      .filter((word) => word.end > word.start)
      .sort((a, b) => a.start - b.start);
    if (sorted.length === 0) return [];

    const speechRates: number[] = [];
    for (const word of sorted) {
      const span = Math.max(0.05, word.end - word.start);
      speechRates.push(1 / span);
    }
    const medianSpeechRate = medianValue(speechRates.filter((v) => Number.isFinite(v) && v > 0));
    const paceBias = clampNumber((medianSpeechRate - 5.8) * 0.015, 0, -0.03, 0.03);
    const minGapSeconds = clampNumber(0.12 + paceBias, 0.12, 0.07, 0.22);
    const pad = clampNumber(0.02 + paceBias * 0.3, 0.02, 0, 0.05);

    const segments: TimeSegment[] = [];
    let cursor = 0;
    for (const word of sorted) {
      const gapStart = clampNumber(cursor + pad, 0, 0, duration);
      const gapEnd = clampNumber(word.start - pad, 0, 0, duration);
      if (gapEnd - gapStart >= minGapSeconds) {
        segments.push({ start: gapStart, end: gapEnd });
      }
      cursor = Math.max(cursor, word.end);
    }
    const tailStart = clampNumber(cursor + pad, 0, 0, duration);
    if (duration - tailStart >= minGapSeconds) {
      segments.push({ start: tailStart, end: duration });
    }

    return capSilencesByBudget(
      normalizeSilenceSegments(segments, duration).filter((s) => s.end - s.start >= 0.07),
      duration,
      0.52,
    );
  };

  const remapTimestampAfterCuts = (time: number, silenceSegments: TimeSegment[]): number => {
    let removed = 0;
    for (const segment of silenceSegments) {
      const gap = segment.end - segment.start;
      if (time >= segment.end) {
        removed += gap;
        continue;
      }
      if (time > segment.start) {
        return Math.max(0, segment.start - removed);
      }
      break;
    }
    return Math.max(0, time - removed);
  };

  const condenseSilenceSegmentsForFfmpeg = (
    silenceSegments: TimeSegment[],
    duration: number,
    maxKeepSegments: number = 96,
  ): TimeSegment[] => {
    if (duration <= 0) return [];
    let normalized = normalizeSilenceSegments(silenceSegments, duration);
    let keepSegments = buildKeepSegments(normalized, duration);

    if (keepSegments.length <= maxKeepSegments) {
      return normalized;
    }

    let minSilenceDuration = 0.2;
    while (keepSegments.length > maxKeepSegments && minSilenceDuration <= 2.5) {
      normalized = normalizeSilenceSegments(
        normalized.filter((segment) => segment.end - segment.start >= minSilenceDuration),
        duration,
      );
      keepSegments = buildKeepSegments(normalized, duration);
      minSilenceDuration += 0.1;
    }

    if (keepSegments.length <= maxKeepSegments) {
      return normalized;
    }

    const maxSilenceSegments = Math.max(0, maxKeepSegments - 1);
    const topSilences = [...normalized]
      .sort((a, b) => (b.end - b.start) - (a.end - a.start))
      .slice(0, maxSilenceSegments)
      .sort((a, b) => a.start - b.start);

    return normalizeSilenceSegments(topSilences, duration);
  };

  const detectSilenceSegmentsFromAudio = async (inputPath: string, duration: number): Promise<TimeSegment[]> => {
    if (!inputPath || !fs.existsSync(inputPath) || duration <= 0) return [];
    const args = [
      "-hide_banner",
      "-i", inputPath,
      "-af", "silencedetect=noise=-38dB:d=0.08",
      "-f", "null",
      "-",
    ];

    const segments: TimeSegment[] = [];
    let pendingStart: number | null = null;
    let stderr = "";

    await new Promise<void>((resolve) => {
      const child = spawn(ffmpegInstaller.path, args, { stdio: ["ignore", "ignore", "pipe"] });
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        const lines = text.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
          if (startMatch) {
            pendingStart = clampNumber(Number(startMatch[1]), 0, 0, duration);
          }
          const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
          if (endMatch) {
            const end = clampNumber(Number(endMatch[1]), 0, 0, duration);
            if (pendingStart !== null && end > pendingStart) {
              segments.push({ start: pendingStart, end });
            }
            pendingStart = null;
          }
        }
      });
      child.on("close", () => {
        if (pendingStart !== null && duration > pendingStart) {
          segments.push({ start: pendingStart, end: duration });
        }
        resolve();
      });
      child.on("error", () => resolve());
    });

    if (!segments.length && stderr.includes("silencedetect")) {
      return [];
    }
    return normalizeSilenceSegments(segments, duration);
  };

  app.post("/api/magic-cut/preview", heavyApiLimiter, requireFirebaseUserMiddleware, async (req: AuthedRequest, res) => {
    try {
      const { captions = [], words = [], duration = 0 } = req.body || {};

      if ((!Array.isArray(captions) || captions.length === 0) && (!Array.isArray(words) || words.length === 0)) {
        return res.json({ silenceSegments: [] });
      }

      const safeDuration = clampNumber(duration, 0, 0, 60 * 60 * 2);
      const inferredDuration = captions.reduce(
        (max: number, caption: any) => Math.max(max, Number(caption?.end || 0)),
        0
      );
      const targetDuration = Math.max(safeDuration, inferredDuration);
      const wordSilences = detectSilenceSegmentsFromWordTimings(words, targetDuration);
      const captionSilences = detectSilenceSegmentsFromCaptions(captions, targetDuration);
      const silenceSegments = normalizeSilenceSegments([...wordSilences, ...captionSilences], targetDuration);

      return res.json({ silenceSegments });
    } catch (error: any) {
      console.error("Magic cut preview failed:", error);
      return res.status(500).json({ error: "Không thể phân tích khoảng lặng." });
    }
  });

  const extractAudioAsMp3 = async (inputPath: string, outputPath: string) => {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .audioBitrate("64k")
        .format("mp3")
        .save(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });
  };

  const splitAudioChunk = async (audioPath: string, outputPath: string, startSec: number, durationSec: number) => {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(audioPath)
        .seekInput(startSec)
        .duration(durationSec)
        .audioCodec("libmp3lame")
        .audioBitrate("32k")
        .audioChannels(1)
        .audioFrequency(16000)
        .format("mp3")
        .save(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });
  };

  const transcribeWhisperWithChunks = async (
    audioPath: string,
    jobId: string,
    language: string,
    openai: any,
    updateJob: (status: string, progress: number, error?: string, result?: any) => void
  ) => {
    const MAX_WHISPER_BYTES = 24 * 1024 * 1024;
    const TARGET_CHUNK_BYTES = 18 * 1024 * 1024;
    const fileStat = fs.statSync(audioPath);
    const cleanupPaths: string[] = [];
    const allWords: any[] = [];

    let chunks: Array<{ path: string; startOffset: number }> = [{ path: audioPath, startOffset: 0 }];
    if (fileStat.size > MAX_WHISPER_BYTES) {
      const durationSec = await getMediaDuration(audioPath);
      if (!durationSec) {
        throw new Error("Không đọc được thời lượng audio để chia chunk.");
      }

      const chunkCount = Math.max(2, Math.ceil(fileStat.size / TARGET_CHUNK_BYTES));
      const chunkDuration = Math.max(30, durationSec / chunkCount);
      chunks = [];
      let startOffset = 0;
      let chunkIndex = 0;
      while (startOffset < durationSec) {
        const currentDuration = Math.min(chunkDuration, durationSec - startOffset);
        const chunkPath = path.join("uploads", `${jobId}_audio_chunk_${chunkIndex}.mp3`);
        updateJob("chunking_audio", 45 + Math.floor((chunkIndex / chunkCount) * 10));
        await splitAudioChunk(audioPath, chunkPath, startOffset, currentDuration);
        cleanupPaths.push(chunkPath);
        chunks.push({ path: chunkPath, startOffset });
        startOffset += currentDuration;
        chunkIndex++;
      }
    }

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        updateJob("transcribing", 50 + Math.floor(((i + 1) / chunks.length) * 35));
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(chunk.path),
          model: "whisper-1",
          response_format: "verbose_json",
          timestamp_granularities: ["word"],
          language: language === "Vietnamese" ? "vi" : (language === "English" ? "en" : undefined)
        });

        const words = (transcription as any).words || [];
        for (const word of words) {
          allWords.push({
            ...word,
            start: (word.start || 0) + chunk.startOffset,
            end: (word.end || 0) + chunk.startOffset
          });
        }
      }
    } finally {
      for (const chunkPath of cleanupPaths) {
        if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
      }
    }

    return allWords;
  };

  const buildCaptionsFromWords = (words: any[]) => {
    if (!Array.isArray(words) || words.length === 0) {
      throw new Error("Không nhận diện được từ ngữ nào trong video.");
    }

    const captures: any[] = [];
    let currentChunk: any[] = [];
    let chunkId = 0;

    for (let i = 0; i < words.length; i++) {
      const currentWord = words[i];
      const nextWord = words[i + 1];

      currentChunk.push(currentWord);

      const isPunctuation = /[.,!?;]/.test(currentWord.word);
      const isTooLong = currentChunk.length >= 5;
      const isLongPause = nextWord && (nextWord.start - currentWord.end > 0.4);

      if (isPunctuation || isTooLong || isLongPause || !nextWord) {
        const text = currentChunk.map((w: any) => w.word.trim()).join(" ");
        const start = Math.max(0, currentChunk[0].start);
        const end = currentChunk[currentChunk.length - 1].end;
        const highlightWord = currentChunk.reduce((longest: any, w: any) =>
          w.word.replace(/[.,!?;]/g, "").length > longest.word.replace(/[.,!?;]/g, "").length ? w : longest
        , currentChunk[0]);

        captures.push({
          id: chunkId.toString(),
          start,
          end,
          text,
          highlight: highlightWord.word.replace(/[.,!?;]/g, "").trim(),
          emoji: ""
        });

        chunkId++;
        currentChunk = [];
      }
    }

    const normalized: any[] = [];
    for (let i = 0; i < captures.length; i++) {
      const current = captures[i];
      const next = captures[i + 1];
      let end = current.end;
      if (next) {
        end = Math.min(end, Math.max(current.start + 0.06, next.start - 0.02));
      }
      normalized.push({
        ...current,
        end,
      });
    }

    return normalized.filter((item) => item.end - item.start >= 0.05);
  };

  const runTranscribeJob = async (task: { jobId: string; userId: string; payload: any }) => {
    const { jobId, payload, userId } = task;
    const { videoUrl, language = "Vietnamese", fileName, uploadedFilePath } = payload;
    const openaiKey = process.env.OPENAI_API_KEY;

    const updateJob = (status: string, progress: number, error?: string, result?: any) => {
      persistJob({ id: jobId, userId, kind: "transcribe", status, progress, error, result, queuePosition: undefined });
      console.log(`[Job ${jobId}] ${status} | ${progress}%`);
    };

    let localFilePath = uploadedFilePath || path.join("uploads", `${jobId}_input.mp4`);
    const audioPath = `${localFilePath}.mp3`;
    try {
      if (!openaiKey) throw new Error("Chưa cấu hình OPENAI_API_KEY.");

      if (!uploadedFilePath && videoUrl) {
        updateJob("downloading", 5);
        const response = await axios({ method: "get", url: videoUrl, responseType: "stream" });
        const writer = fs.createWriteStream(localFilePath);
        response.data.pipe(writer);
        await new Promise<void>((resolve, reject) => {
          writer.on("finish", () => resolve());
          writer.on("error", reject);
        });
      }

      updateJob("extracting", 15);
      await extractAudioAsMp3(localFilePath, audioPath);
      if (!fs.existsSync(audioPath)) throw new Error("Lỗi khi trích xuất âm thanh từ video.");

      updateJob("transcribing", 50);
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: openaiKey });
      const words = await transcribeWhisperWithChunks(audioPath, jobId, language, openai, updateJob);
      const captures = buildCaptionsFromWords(words);
      updateJob("done", 100, undefined, {
        captions: captures,
        words: words.map((word: any) => ({
          start: Number(word.start || 0),
          end: Number(word.end || 0),
          word: String(word.word || ""),
        })),
      });
    } catch (e: any) {
      console.error(`[Job ${jobId}] Error:`, e);
      if (openaiKey) {
        console.error(`[Job ${jobId}] API Key mask:`, openaiKey.substring(0, 5) + "..." + openaiKey.slice(-4), "Len:", openaiKey.length);
      }
      let msg = e.message || "Lỗi sự cố máy chủ.";
      if (typeof msg === "string" && msg.includes("ApiError:")) {
        try {
          const jsonStr = msg.replace("ApiError:", "").trim();
          const jsonErr = JSON.parse(jsonStr);
          if (jsonErr.error && jsonErr.error.message) msg = jsonErr.error.message;
        } catch {}
      }
      if (msg.includes("429") || msg.includes("quota") || msg.includes("insufficient_quota")) {
        msg = "LỖI OPENAI QUOTA: Tài khoản OpenAI của bạn đã hết hạn mức (hết tiền) hoặc chưa thêm thẻ thanh toán (Error 429). Giải pháp:\n1. Vào trang billing của OpenAI (https://platform.openai.com/account/billing) để nạp thêm credits.\n2. Hoặc sử dụng một API Key khác có sẵn số dư dự phòng.";
      } else if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid") || (typeof e.message === "string" && e.message.includes("API key not valid"))) {
        msg = "LỖI API KEY: Khóa API hiện tại bị từ chối. CÁCH KHẮC PHỤC: Vào Settings -> Secrets -> Bấm \"+ Add secret\", đặt Name là OPENAI_API_KEY và dán mã mới của bạn vào ô Value. Bấm Apply changes rồi thử lại.";
      }
      updateJob("error", 0, msg);
      throw new Error(msg);
    } finally {
      if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }
  };

  const runExportJob = async (task: { jobId: string; userId: string; payload: any }) => {
    const { jobId, payload, userId } = task;
    const {
      plan: payloadPlan,
      videoUrl,
      uploadedFilePath,
      captions,
      brolls = [],
      zooms = [],
      isSnapMode,
      style,
      captionSettings,
      isMagicCutEnabled = false,
      silenceSegments = [],
      words = [],
      transitionType = "GLARE_SWEEP",
      customTextOverlays = [],
      videoAdjustments = {},
      cleanAudioEnabled = false,
      brandKit = null,
    } = payload;
    const exportPlan: PlanType =
      payloadPlan === "BASIC" || payloadPlan === "PRO" ? payloadPlan : await getUserPlan(userId);
    const exportProfile = PLAN_EXPORT[exportPlan];
    const exportW = exportProfile.width;
    const exportH = exportProfile.height;
    const exportScale = `${exportW}:${exportH}`;
    const updateJob = (status: string, progress: number, error?: string, result?: any) => {
      persistJob({ id: jobId, userId, kind: "export", status, progress, error, result, queuePosition: undefined });
    };

    const mainInputPath = path.join("uploads", `${jobId}_main.mp4`);
    const assPath = path.join("uploads", `${jobId}.ass`);
    const outPath = path.join("uploads", `${jobId}_out.mp4`);
    const snapOverlayPath = path.join(__dirname, "public", "assets", "snap", "snap-black-overlay.png");
    const snapFontsDirPath = path.join(__dirname, "public", "fonts", "sf-pro-display", "SF Pro Display", "SF-Pro-Display");
    const brollPaths: string[] = [];
    const downloadedBrolls: any[] = [];
    const normalizedUploadPath = typeof uploadedFilePath === "string" ? path.normalize(uploadedFilePath) : "";
    const uploadPrefix = path.normalize("uploads" + path.sep);
    const useUploadedMainPath =
      normalizedUploadPath.startsWith(uploadPrefix) &&
      fs.existsSync(normalizedUploadPath);
    const sourceMainPath = useUploadedMainPath ? normalizedUploadPath : mainInputPath;

    try {
      if (useUploadedMainPath) {
        updateJob("downloading_main", 8);
      } else {
        updateJob("downloading_main", 5);
        const mainRes = await axios({ method: "get", url: videoUrl, responseType: "stream" });
        const mainWriter = fs.createWriteStream(mainInputPath);
        mainRes.data.pipe(mainWriter);
        await new Promise<void>((resolve, reject) => {
          mainWriter.on("finish", () => resolve());
          mainWriter.on("error", reject);
        });
      }

      // Keep export behavior aligned with UI selections:
      // if user selected B-roll/captions/text overlays, always render them.
      const shouldApplyBroll = Array.isArray(brolls) && brolls.length > 0;
      if (shouldApplyBroll) {
        updateJob("downloading_brolls", 10);
        for (let i = 0; i < brolls.length; i++) {
          const b = brolls[i];
          const bPath = path.join("uploads", `${jobId}_broll_${i}.mp4`);
          updateJob(`downloading_broll_${i + 1}/${brolls.length}`, 10 + Math.floor((i / brolls.length) * 10));
          try {
            const bRes = await axios({ method: "get", url: b.videoUrl, responseType: "stream" });
            const bWriter = fs.createWriteStream(bPath);
            bRes.data.pipe(bWriter);
            await new Promise<void>((resolve, reject) => {
              bWriter.on("finish", () => resolve());
              bWriter.on("error", reject);
            });
            brollPaths.push(bPath);
            downloadedBrolls.push(b);
          } catch (e) {
            console.error(`Failed to download broll ${i}`, e);
          }
        }
      }

      let duration = 30;
      let videoSize = { width: exportW, height: exportH };
      let hasAudio = true;
      try {
        const metadata = await getVideoMetadata(sourceMainPath);
        duration = metadata.duration || 30;
        videoSize = { width: exportW, height: exportH };
        hasAudio = Boolean((metadata as any).hasAudio ?? true);
      } catch (e) {
        console.warn("Could not get metadata for duration", e);
      }

      let normalizedSilences = isMagicCutEnabled
        ? normalizeSilenceSegments(silenceSegments, duration)
        : [];
      if (isMagicCutEnabled && normalizedSilences.length === 0) {
        // Fallback when client does not provide silence ranges:
        // infer silence by gaps between caption segments.
        normalizedSilences = detectSilenceSegmentsFromCaptions(captions, duration);
      }
      if (isMagicCutEnabled && normalizedSilences.length === 0 && Array.isArray(words) && words.length > 0) {
        normalizedSilences = detectSilenceSegmentsFromWordTimings(words, duration);
      }
      if (isMagicCutEnabled) {
        const cutDuration = normalizedSilences.reduce((acc, s) => acc + Math.max(0, s.end - s.start), 0);
        const cutRatio = duration > 0 ? (cutDuration / duration) : 0;
        if (cutRatio < 0.03) {
          updateJob("analyzing_audio_silence", 24);
          const audioSilences = await detectSilenceSegmentsFromAudio(sourceMainPath, duration);
          if (audioSilences.length > 0) {
            normalizedSilences = normalizeSilenceSegments([...normalizedSilences, ...audioSilences], duration);
          }
        }
      }
      if (isMagicCutEnabled && normalizedSilences.length > 0) {
        normalizedSilences = condenseSilenceSegmentsForFfmpeg(normalizedSilences, duration);
      }
      const keepSegments = buildKeepSegments(normalizedSilences, duration);
      const canApplyMagicCut = normalizedSilences.length > 0 && keepSegments.length > 0 && keepSegments.length <= 96;
      const effectiveSilences = canApplyMagicCut ? normalizedSilences : [];

      const remappedCaptions = Array.isArray(captions)
        ? captions
          .map((caption: any) => {
            const nextStart = remapTimestampAfterCuts(Number(caption.start || 0), effectiveSilences);
            const nextEnd = remapTimestampAfterCuts(Number(caption.end || 0), effectiveSilences);
            if (nextEnd <= nextStart + 0.02) return null;
            return {
              ...caption,
              start: nextStart,
              end: nextEnd,
            };
          })
          .filter(Boolean)
        : [];
      const remappedZooms = Array.isArray(zooms)
        ? zooms.map((zoom: any) => ({
            ...zoom,
            timestamp: remapTimestampAfterCuts(Number(zoom.timestamp || 0), effectiveSilences),
          }))
        : [];
      const shouldRenderSubtitles = remappedCaptions.length > 0;
      const normalizedAdjustments = normalizeVideoAdjustments(videoAdjustments);
      const hasVideoAdjustments = !isNeutralVideoAdjustments(normalizedAdjustments);
      const normalizedCustomTexts = Array.isArray(customTextOverlays) ? customTextOverlays : [];
      const shouldRenderAnyText = shouldRenderSubtitles || normalizedCustomTexts.length > 0;
      const shouldApplySnapOverlay = Boolean(isSnapMode) && fs.existsSync(snapOverlayPath);

      updateJob("creating_subtitles", 25);
      if (shouldRenderAnyText) {
        const assContent = buildAssSubtitles(remappedCaptions, captionSettings, style, videoSize, normalizedCustomTexts);
        fs.writeFileSync(assPath, assContent);
      }
      updateJob("rendering_video", 30);

      let filterComplex = "";
      let lastLabel = "[0:v]";
      let audioLabel = hasAudio ? "0:a?" : "";
      const transitionConfig = resolveTransitionConfig(transitionType);

      if (canApplyMagicCut) {
        for (let i = 0; i < keepSegments.length; i++) {
          const segment = keepSegments[i];
          filterComplex += `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[vtrim${i}];`;
          if (hasAudio) {
            filterComplex += `[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[atrim${i}];`;
          }
        }

        const transitionDuration = transitionConfig.duration;
        const canUseTransitions = keepSegments.length > 1
          && transitionDuration > 0
          && keepSegments.length <= 24
          && keepSegments.every((segment) => (segment.end - segment.start) > transitionDuration + 0.06);

        if (canUseTransitions) {
          let currentVLabel = "vtrim0";
          let currentALabel = hasAudio ? "atrim0" : "";
          let accumulatedDuration = Math.max(0, keepSegments[0].end - keepSegments[0].start);

          for (let i = 1; i < keepSegments.length; i++) {
            const segmentDuration = Math.max(0, keepSegments[i].end - keepSegments[i].start);
            const nextVLabel = i === keepSegments.length - 1 ? "vcut" : `vxf${i}`;
            const xfadeOffset = Math.max(0.01, accumulatedDuration - transitionDuration);
            filterComplex += `[${currentVLabel}][vtrim${i}]xfade=transition=${transitionConfig.xfade}:duration=${transitionDuration}:offset=${xfadeOffset}[${nextVLabel}];`;
            currentVLabel = nextVLabel;

            if (hasAudio) {
              const nextALabel = i === keepSegments.length - 1 ? "acut" : `axf${i}`;
              filterComplex += `[${currentALabel}][atrim${i}]acrossfade=d=${transitionDuration}:c1=tri:c2=tri[${nextALabel}];`;
              currentALabel = nextALabel;
            }
            accumulatedDuration += Math.max(0, segmentDuration - transitionDuration);
          }
          lastLabel = "[vcut]";
          audioLabel = hasAudio ? "[acut]" : "";
        } else {
          const concatInputs = keepSegments
            .map((_, i) => hasAudio ? `[vtrim${i}][atrim${i}]` : `[vtrim${i}]`)
            .join("");
          filterComplex += `${concatInputs}concat=n=${keepSegments.length}:v=1:a=${hasAudio ? 1 : 0}[vcut]${hasAudio ? "[acut]" : ""};`;
          lastLabel = "[vcut]";
          audioLabel = hasAudio ? "[acut]" : "";
        }
      }

      if (remappedZooms && remappedZooms.length > 0) {
        let zoomFilter = "";
        remappedZooms.forEach((z: any) => {
          const start = z.timestamp;
          const end = z.timestamp + (z.duration || 2);
          zoomFilter += `if(between(t,${start},${end}),1.2,1.0)*`;
        });
        if (zoomFilter.endsWith("*")) zoomFilter = zoomFilter.slice(0, -1);
        else zoomFilter = "1.0";
        const zoomExpr = escapeFfmpegExpr(zoomFilter);
        filterComplex += `${lastLabel}scale='trunc(iw*(${zoomExpr})/2)*2':-2:eval=frame,crop='trunc(iw/(${zoomExpr})/2)*2':'trunc(ih/(${zoomExpr})/2)*2'[vzoom];`;
        lastLabel = "[vzoom]";
      }

      if (hasVideoAdjustments) {
        const adjustmentFilter = buildVideoAdjustmentFilter(normalizedAdjustments);
        filterComplex += `${lastLabel}${adjustmentFilter}[vadj];`;
        lastLabel = "[vadj]";
      }

      if (shouldApplySnapOverlay) {
        const snapInputIdx = 1;
        filterComplex += `[${snapInputIdx}:v]scale=${exportScale},format=rgba,fade=t=in:st=0:d=1:alpha=1,setpts=PTS-STARTPTS[snapov];`;
        filterComplex += `${lastLabel}[snapov]overlay=x=0:y=0:format=auto[vsnap];`;
        lastLabel = "[vsnap]";
      }

      for (let i = 0; i < brollPaths.length; i++) {
        const sourceBroll = downloadedBrolls[i] || {};
        const bDuration = Math.max(0.8, Number(sourceBroll.duration || 3));
        const bTimestamp = remapTimestampAfterCuts(Number(sourceBroll.timestamp || 0), effectiveSilences);
        const brollFadeDuration = Math.max(0, Math.min(transitionConfig.brollFade, bDuration * 0.35));
        const fadeOutStart = Math.max(0.05, bDuration - brollFadeDuration);
        const b = {
          ...sourceBroll,
          timestamp: bTimestamp,
          duration: bDuration,
        };
        const inputIdx = i + 1 + (shouldApplySnapOverlay ? 1 : 0);
        const brollInputLabel = `b${i}`;
        if (brollFadeDuration > 0) {
          filterComplex += `[${inputIdx}:v]scale=${exportScale}:force_original_aspect_ratio=increase,crop=${exportScale},setsar=1,trim=duration=${bDuration},format=rgba,fade=t=in:st=0:d=${brollFadeDuration}:alpha=1,fade=t=out:st=${fadeOutStart}:d=${brollFadeDuration}:alpha=1,setpts=PTS-STARTPTS+${b.timestamp}/TB[${brollInputLabel}];`;
        } else {
          filterComplex += `[${inputIdx}:v]scale=${exportScale}:force_original_aspect_ratio=increase,crop=${exportScale},setsar=1,trim=duration=${bDuration},setpts=PTS-STARTPTS+${b.timestamp}/TB[${brollInputLabel}];`;
        }
        filterComplex += `${lastLabel}[${brollInputLabel}]overlay=x=0:y=0:format=auto[vover${i}];`;
        lastLabel = `[vover${i}]`;
      }

      let pipelineLabel = lastLabel;
      const needsExportFit =
        exportProfile.watermark ||
        exportW !== 1080 ||
        exportH !== 1920;

      if (needsExportFit) {
        filterComplex += `${pipelineLabel}scale=${exportScale}:force_original_aspect_ratio=decrease,pad=${exportScale}:(ow-iw)/2:(oh-ih)/2,setsar=1[vfit];`;
        pipelineLabel = "[vfit]";
      }

      const brandWatermark = String(brandKit?.watermarkText || "").trim();
      if (exportProfile.watermark) {
        const watermarkText = (brandWatermark || "EverySunday").replace(/'/g, "");
        filterComplex += `${pipelineLabel}drawtext=text='${watermarkText}':fontsize=h/22:fontcolor=white@0.38:x=w-tw-48:y=h-th-48:borderw=2:bordercolor=black@0.25[vwm];`;
        pipelineLabel = "[vwm]";
      }

      if (shouldRenderAnyText) {
        const escapedAssPath = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
        if (fs.existsSync(snapFontsDirPath)) {
          const escapedFontsDir = snapFontsDirPath.replace(/\\/g, "/").replace(/:/g, "\\:");
          filterComplex += `${pipelineLabel}subtitles='${escapedAssPath}':fontsdir='${escapedFontsDir}'[vout]`;
        } else {
          filterComplex += `${pipelineLabel}subtitles='${escapedAssPath}'[vout]`;
        }
      } else {
        filterComplex += `${pipelineLabel}format=yuv420p[vout]`;
      }

      const needsComplexRender =
        canApplyMagicCut ||
        remappedZooms.length > 0 ||
        brollPaths.length > 0 ||
        shouldRenderAnyText ||
        hasVideoAdjustments ||
        needsExportFit;

      const encoderPreset = selectEncoderPreset({
        duration,
        keepSegments: keepSegments.length,
        zoomCount: remappedZooms.length,
        brollCount: brollPaths.length,
        hasText: shouldRenderAnyText,
        hasAdjustments: hasVideoAdjustments,
      });

      let finalAudioMap = audioLabel;
      if (cleanAudioEnabled && audioLabel && audioLabel.startsWith("[")) {
        filterComplex += `;${audioLabel}afftdn=nf=-20,highpass=f=80,lowpass=f=12000[aclean];`;
        finalAudioMap = "[aclean]";
      }

      const renderPrimary = async () => {
        if (!needsComplexRender) {
          const simpleFilter = exportProfile.watermark
            ? `scale=${exportScale}:force_original_aspect_ratio=decrease,pad=${exportScale}:(ow-iw)/2:(oh-ih)/2,drawtext=text='EverySunday':fontsize=h/24:fontcolor=white@0.38:x=w-tw-48:y=h-th-48`
            : `scale=${exportScale}:force_original_aspect_ratio=decrease,pad=${exportScale}:(ow-iw)/2:(oh-ih)/2`;
          const audioFilters = cleanAudioEnabled ? "afftdn=nf=-20,highpass=f=80,lowpass=f=12000" : undefined;
          await new Promise<void>((resolve, reject) => {
            const cmd = ffmpeg(sourceMainPath).videoFilters(simpleFilter);
            if (audioFilters) cmd.audioFilters(audioFilters);
            cmd
              .outputOptions([
                "-c:v", "libx264",
                "-preset", encoderPreset,
                "-crf", exportProfile.crf,
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "160k",
                "-movflags", "+faststart",
              ])
              .on("progress", () => updateJob("rendering_video", 80))
              .on("end", () => resolve())
              .on("error", (err: any, _stdout: string, stderr: string) => {
                const details = stderr || err?.stderr || "";
                reject(new Error(`${err?.message || "ffmpeg render failed"}${details ? `\n${details}` : ""}`));
              })
              .save(outPath);
          });
          return;
        }

        const ffmpegCmd = ffmpeg(sourceMainPath);
        if (shouldApplySnapOverlay) ffmpegCmd.input(snapOverlayPath);
        for (const bp of brollPaths) ffmpegCmd.input(bp);

        await new Promise<void>((resolve, reject) => {
          ffmpegCmd
            .complexFilter(filterComplex)
            .outputOptions([
              "-map",
              "[vout]",
              ...(finalAudioMap ? ["-map", finalAudioMap] : []),
              "-preset",
              encoderPreset,
              "-c:v",
              "libx264",
              "-pix_fmt",
              "yuv420p",
              "-movflags",
              "+faststart",
              ...(audioLabel ? ["-c:a", "aac", "-b:a", "160k"] : []),
              "-crf",
              exportProfile.crf,
            ])
            .on("progress", (p) => {
              if (p.percent) updateJob("rendering_video", 30 + Math.floor(p.percent * 0.65));
            })
            .on("end", () => resolve())
            .on("error", (err: any, _stdout: string, stderr: string) => {
              const details = stderr || err?.stderr || "";
              reject(new Error(`${err?.message || "ffmpeg render failed"}${details ? `\n${details}` : ""}`));
            })
            .save(outPath);
        });
      };

      // Strict pipeline mode: never downgrade features silently.
      // Retry the same full filter graph once to handle transient ffmpeg issues.
      const maxRenderAttempts = 2;
      let renderDone = false;
      let lastRenderError: any = null;
      for (let attempt = 1; attempt <= maxRenderAttempts && !renderDone; attempt++) {
        try {
          if (attempt > 1) {
            updateJob("retrying_full_pipeline", 55, `Retrying full export pipeline (attempt ${attempt}/${maxRenderAttempts})`);
          }
          await renderPrimary();
          renderDone = true;
        } catch (err: any) {
          lastRenderError = err;
          const reason = normalizeErrorReason(err) || String(err?.message || "render failed");
          console.error(`Full pipeline render attempt ${attempt} failed:`, reason);
          if (attempt < maxRenderAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 800));
          }
        }
      }

      if (!renderDone) {
        throw lastRenderError || new Error("Full pipeline render failed");
      }

      updateJob("uploading_result", 95);
      try {
        const fileBuffer = fs.readFileSync(outPath);
        const resultRef = storageRef(storage, `exports/${jobId}_out.mp4`);
        await uploadBytes(resultRef, fileBuffer, { contentType: "video/mp4" });
        const downloadUrl = await getDownloadURL(resultRef);
        updateJob("done", 100, undefined, { downloadUrl });
      } catch (uploadErr: any) {
        console.error("Firebase Storage Upload Error:", uploadErr);
        updateJob("done", 100, undefined, { downloadUrl: `/api/download/${jobId}` });
      }
    } catch (e: any) {
      console.error("Export error", e);
      const reason = normalizeErrorReason(e);
      updateJob("error", 0, reason || "Lỗi render video.");
      throw new Error(reason || "Lỗi render video.");
    } finally {
      if (!useUploadedMainPath && fs.existsSync(mainInputPath)) fs.unlinkSync(mainInputPath);
      if (useUploadedMainPath && fs.existsSync(sourceMainPath)) fs.unlinkSync(sourceMainPath);
      if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
      brollPaths.forEach((p) => { if (fs.existsSync(p)) fs.unlinkSync(p); });
      setTimeout(() => {
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      }, 15 * 60 * 1000);
    }
  };

  const executeTask = async (task: QueuedTask) => {
    const maxAttempts = getMaxAttempts(task.kind);
    let attempt = 0;
    let completed = false;
    persistJob({ id: task.jobId, userId: task.userId, kind: task.kind, status: "processing", progress: 1, queuePosition: undefined });

    try {
      while (attempt < maxAttempts && !completed) {
        attempt += 1;
        persistJob({
          id: task.jobId,
          userId: task.userId,
          kind: task.kind,
          status: attempt === 1 ? "processing" : "retrying",
          progress: Math.max(1, jobs.get(task.jobId)?.progress || 1),
          queuePosition: undefined,
          error: undefined,
          result: {
            ...(typeof jobs.get(task.jobId)?.result === "object" ? jobs.get(task.jobId)?.result : {}),
            attempt,
            maxAttempts,
          },
        });

        try {
          if (task.kind === "transcribe") await runTranscribeJob(task);
          else await runExportJob(task);
          completed = true;
          recordJobFinal(task.kind, true, attempt);
        } catch (error: any) {
          const reason = normalizeErrorReason(error);
          const retryable = attempt < maxAttempts && isRetryableJobError(error);
          if (!retryable) throw error;

          const delayMs = backoffDelayMs(task.kind, attempt);
          recordJobRetry(task.kind);
          persistJob({
            id: task.jobId,
            userId: task.userId,
            kind: task.kind,
            status: "retrying",
            progress: Math.max(1, jobs.get(task.jobId)?.progress || 1),
            error: `Attempt ${attempt}/${maxAttempts} failed. Retrying in ${Math.round(delayMs / 1000)}s. ${reason}`,
            queuePosition: undefined,
          });
          await sleep(delayMs);
        }
      }
    } catch (error: any) {
      const reason = normalizeErrorReason(error);
      recordJobFinal(task.kind, false, Math.max(1, attempt), {
        jobId: task.jobId,
        kind: task.kind,
        userId: task.userId,
        attempt: Math.max(1, attempt),
        maxAttempts,
        reason,
        at: Date.now(),
      });
      persistJob({
        id: task.jobId,
        userId: task.userId,
        kind: task.kind,
        status: "error",
        progress: 0,
        error: reason || "Worker error",
        queuePosition: undefined,
        result: {
          ...(typeof jobs.get(task.jobId)?.result === "object" ? jobs.get(task.jobId)?.result : {}),
          attempt: Math.max(1, attempt),
          maxAttempts,
        },
      });
    }
  };

  const runQueuedTask = (task: QueuedTask) => {
    runningWorkers++;
    (async () => {
      try {
        await executeTask(task);
      } finally {
        runningWorkers--;
        void maybeRunWorkers();
      }
    })();
  };

  const maybeRunWorkers = async () => {
    if (!shouldRunInlineWorkers()) return;
    while (runningWorkers < maxWorkerConcurrency) {
      const task = await jobQueue.dequeue(0);
      if (!task) break;
      runQueuedTask(task);
    }
  };

  const startDedicatedWorkerLoop = () => {
    const workerConcurrency = Math.max(1, Number(process.env.JOB_WORKER_CONCURRENCY || 1));
    console.log(`[worker] Dedicated worker started (concurrency=${workerConcurrency})`);
    for (let slot = 0; slot < workerConcurrency; slot++) {
      (async () => {
        while (true) {
          try {
            const task = await jobQueue.dequeue(8000);
            if (!task) continue;
            await executeTask(task);
          } catch (loopError) {
            console.error(`[worker] slot ${slot} error:`, loopError);
            await sleep(1200);
          }
        }
      })();
    }
  };

  // API Route to queue transcription jobs for background workers.
  app.post("/api/jobs/create", heavyApiLimiter, requireFirebaseUserMiddleware, upload.single("video"), async (req: AuthedRequest, res) => {
    try {
      const userId = req.firebaseUser!.uid;
      const plan = await getUserPlan(userId);
      await assertMonthlyTranscribeUsage(userId, plan);
      await assertDailyUsage(userId, plan, "transcribeJobs", "dailyTranscribeJobs");

      const { videoUrl, language = "Vietnamese", fileName } = req.body;
      const file = req.file;
      if (!file && !videoUrl) {
        return res.status(400).json({ error: "Chưa tải video lên hoặc thiếu URL video." });
      }

      if (!isFullTestMode && file && file.size > PLAN_LIMITS[plan].maxUploadBytes) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(413).json({ error: `Video vượt giới hạn dung lượng của gói ${plan}.` });
      }

      if (file) {
        const durationSec = await getMediaDuration(file.path);
        if (!isFullTestMode && durationSec > PLAN_LIMITS[plan].maxDurationSeconds) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          return res.status(413).json({ error: `Video vượt giới hạn thời lượng của gói ${plan}.` });
        }
        const transcribeCredits = Math.max(1, Math.ceil(durationSec / 60) * FEATURE_CREDIT_COST.transcribePerMinute);
        await reserveCredits(userId, plan, "transcribe", transcribeCredits);
      }

      const jobId = randomUUID();
      await enqueueJob({
        jobId,
        userId,
        kind: "transcribe",
        payload: {
          videoUrl,
          language,
          fileName,
          uploadedFilePath: file ? file.path : null
        }
      });
      await incrementDailyUsage(userId, "transcribeJobs");
      await incrementMonthlyTranscribeUsage(userId);
      return res.status(202).json({ jobId });
    } catch (err: any) {
      if (isLimitError(err)) {
        return res.status(429).json({ error: getErrorMessage(err) });
      }
      if (isCreditError(err)) {
        return res.status(402).json({ error: getErrorMessage(err) });
      }
      return res.status(500).json({ error: "Không thể tạo job xử lý video lúc này." });
    }
  });

  // Upload-only endpoint for export flow (avoid external storage upload stalls).
  app.post("/api/uploads/raw", heavyApiLimiter, requireFirebaseUserMiddleware, upload.single("video"), async (req: AuthedRequest, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "Thiếu file video upload." });
      }
      const safePath = path.normalize(file.path);
      if (!safePath.startsWith(path.normalize("uploads" + path.sep))) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(400).json({ error: "Đường dẫn upload không hợp lệ." });
      }
      return res.status(200).json({ uploadedFilePath: safePath });
    } catch (err: any) {
      return res.status(500).json({ error: "Upload file export thất bại." });
    }
  });

  // Debug endpoint: get most recent jobs in memory for quick troubleshooting from UI.
  app.get("/api/jobs/recent", requireFirebaseUserMiddleware, (req: AuthedRequest, res) => {
    const userId = req.firebaseUser!.uid;
    const limit = Math.max(1, Math.min(20, Number(req.query.limit || 5)));
    const recent = Array.from(jobs.values())
      .filter((job) => job.userId === userId)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, limit);
    res.json({ jobs: recent });
  });

  app.get("/api/jobs/metrics", requireFirebaseUserMiddleware, async (req: AuthedRequest, res) => {
    const uid = req.firebaseUser?.uid || "";
    const adminUids = String(process.env.ADMIN_UIDS || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const canViewMetrics = uid === "local-dev-user" || adminUids.includes(uid);
    if (!canViewMetrics) {
      return res.status(403).json({ error: "Bạn không có quyền xem metrics hệ thống." });
    }

    const summarize = (kind: JobKind) => {
      const success = monitor[kind].success;
      const failure = monitor[kind].failure;
      const finished = success + failure;
      const avgAttempts = finished > 0 ? Number((monitor[kind].totalAttempts / finished).toFixed(2)) : 0;
      const failureRate = finished > 0 ? Number(((failure / finished) * 100).toFixed(2)) : 0;
      return {
        success,
        failure,
        retries: monitor[kind].retries,
        finished,
        avgAttempts,
        failureRatePercent: failureRate,
        recentFailures: monitor[kind].recentFailures.slice(0, 20),
      };
    };

    const queueDepth = await jobQueue.size();
    res.json({
      workers: {
        runningWorkers,
        maxWorkerConcurrency,
        queueDepth,
      },
      transcribe: summarize("transcribe"),
      export: summarize("export"),
      latestFailedJobs: Array.from(jobs.values())
        .filter((job) => job.status === "error")
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 15)
        .map((job) => ({
          id: job.id,
          kind: job.kind,
          userId: job.userId,
          error: job.error,
          updatedAt: job.updatedAt,
        })),
    });
  });

  // API Route to poll job status
  app.get("/api/jobs/:id", requireFirebaseUserMiddleware, async (req: AuthedRequest, res) => {
      const job = await readJob(req.params.id);
      if (!job) return res.status(404).json({ error: "Thất lạc JobID hoặc đã hết thời gian lưu trữ." });
      if (job.userId && job.userId !== req.firebaseUser!.uid) {
        return res.status(403).json({ error: "Bạn không có quyền xem tiến trình này." });
      }
      res.json(job);
  });

  // API Route to queue export jobs for background workers.
  app.post("/api/jobs/export", heavyApiLimiter, requireFirebaseUserMiddleware, async (req: AuthedRequest, res) => {
    try {
      const userId = req.firebaseUser!.uid;
      const plan = await getUserPlan(userId);
      await assertDailyUsage(userId, plan, "exportJobs", "dailyExportJobs");
      const {
        videoUrl,
        uploadedFilePath = null,
        captions,
        brolls = [],
        zooms = [],
        style,
        isSnapMode,
        captionSettings,
        isMagicCutEnabled = false,
        silenceSegments = [],
        words = [],
        transitionType = "GLARE_SWEEP",
        customTextOverlays = [],
        videoAdjustments = {},
        cleanAudioEnabled = false,
        brandKit = null,
      } = req.body;

      let resolvedBrandKit = brandKit;
      if (!resolvedBrandKit) {
        try {
          const brandSnap = await adminDb.collection("brand_kits").doc(userId).get();
          if (brandSnap.exists) resolvedBrandKit = brandSnap.data();
        } catch {
          resolvedBrandKit = null;
        }
      }
      
      if (!videoUrl && !uploadedFilePath) return res.status(400).json({ error: "Chưa tải video lên." });
      if (!captions) return res.status(400).json({ error: "Chưa gửi phụ đề." });
      const captionDuration = Array.isArray(captions)
        ? captions.reduce((max: number, caption: any) => Math.max(max, Number(caption?.end || 0)), 0)
        : 0;
      const exportMinutes = Math.max(1, Math.ceil(captionDuration / 60));
      const exportCredits = exportMinutes * FEATURE_CREDIT_COST.exportPerMinute;
      await reserveCredits(userId, plan, "export", exportCredits);
      
      const jobId = `exp_${randomUUID()}`;
      await enqueueJob({
        jobId,
        userId,
        kind: "export",
        payload: {
          plan,
          videoUrl,
          uploadedFilePath,
          captions,
          brolls,
          zooms,
          style,
          isSnapMode,
          captionSettings,
          isMagicCutEnabled,
          silenceSegments,
          words,
          transitionType,
          customTextOverlays,
          videoAdjustments,
          cleanAudioEnabled: Boolean(cleanAudioEnabled),
          brandKit: resolvedBrandKit,
        }
      });
      await incrementDailyUsage(userId, "exportJobs");
      res.status(202).json({ jobId });

    } catch (e: any) {
      if (isLimitError(e)) {
        return res.status(429).json({ error: getErrorMessage(e) });
      }
      if (isCreditError(e)) {
        return res.status(402).json({ error: getErrorMessage(e) });
      }
      res.status(500).json({ error: "Không thể tạo job export lúc này." });
    }
  });

  const DEFAULT_BRAND_KIT = {
    displayName: "EverySunday",
    primaryColor: "#18181b",
    accentColor: "#f97316",
    watermarkText: "EverySunday",
    fontFamily: "SF Pro Display",
    logoUrl: "",
  };

  app.get("/api/brand-kit/me", requireFirebaseUserMiddleware, async (req: AuthedRequest, res) => {
    try {
      const userId = req.firebaseUser!.uid;
      const snap = await adminDb.collection("brand_kits").doc(userId).get();
      res.json(snap.exists ? { ...DEFAULT_BRAND_KIT, ...snap.data() } : DEFAULT_BRAND_KIT);
    } catch {
      res.status(500).json({ error: "Không thể tải Brand Kit." });
    }
  });

  app.put("/api/brand-kit/me", requireFirebaseUserMiddleware, async (req: AuthedRequest, res) => {
    try {
      const userId = req.firebaseUser!.uid;
      const plan = await getUserPlan(userId);
      if (plan === "FREE") {
        return res.status(403).json({ error: "Brand Kit dành cho gói Basic trở lên." });
      }
      const payload = {
        displayName: String(req.body?.displayName || DEFAULT_BRAND_KIT.displayName).slice(0, 80),
        primaryColor: String(req.body?.primaryColor || DEFAULT_BRAND_KIT.primaryColor).slice(0, 32),
        accentColor: String(req.body?.accentColor || DEFAULT_BRAND_KIT.accentColor).slice(0, 32),
        watermarkText: String(req.body?.watermarkText || DEFAULT_BRAND_KIT.watermarkText).slice(0, 40),
        fontFamily: String(req.body?.fontFamily || DEFAULT_BRAND_KIT.fontFamily).slice(0, 80),
        logoUrl: String(req.body?.logoUrl || "").slice(0, 500),
        updatedAt: FieldValue.serverTimestamp(),
      };
      await adminDb.collection("brand_kits").doc(userId).set(payload, { merge: true });
      res.json(payload);
    } catch {
      res.status(500).json({ error: "Không thể lưu Brand Kit." });
    }
  });

  app.post("/api/publish/tiktok", heavyApiLimiter, requireFirebaseUserMiddleware, async (req: AuthedRequest, res) => {
    try {
      const userId = req.firebaseUser!.uid;
      const plan = await getUserPlan(userId);
      if (plan !== "PRO" && plan !== "BASIC") {
        return res.status(403).json({ error: "Publish TikTok yêu cầu gói Basic hoặc Pro." });
      }
      const { downloadUrl, caption = "", hashtags = [] } = req.body || {};
      if (!downloadUrl) {
        return res.status(400).json({ error: "Thiếu link video đã export." });
      }
      const publishId = randomUUID();
      const captionText = [caption, Array.isArray(hashtags) ? hashtags.map((h: string) => `#${String(h).replace(/^#/, "")}`).join(" ") : ""]
        .filter(Boolean)
        .join("\n");
      await adminDb.collection("publish_requests").add({
        userId,
        platform: "tiktok",
        downloadUrl,
        caption: captionText,
        status: "ready_for_manual_upload",
        uploadUrl: "https://www.tiktok.com/upload",
        createdAt: FieldValue.serverTimestamp(),
      });
      res.json({
        publishId,
        status: "ready_for_manual_upload",
        message: "Video đã sẵn sàng. Mở TikTok Studio để upload (OAuth API sẽ được bật khi có TikTok App credentials).",
        uploadUrl: "https://www.tiktok.com/upload",
        captionSuggestion: captionText,
        downloadUrl,
      });
    } catch {
      res.status(500).json({ error: "Không thể tạo yêu cầu publish TikTok." });
    }
  });

  // Route to download exported video
  app.get("/api/download/:id", (req, res) => {
    const jobId = req.params.id;
    const outPath = path.join("uploads", `${jobId}_out.mp4`);
    if (fs.existsSync(outPath)) {
      res.download(outPath, "everysunday-export.mp4");
    } else {
      res.status(404).json({ error: "File not found or already deleted." });
    }
  });

  // API Fallback
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  // Global Error Handler (including Multer errors)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("Global error:", err);
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: "Video quá lớn. Giới hạn là 500MB." });
      }
      return res.status(400).json({ error: "Upload file không hợp lệ." });
    }
    res.status(500).json({ error: safeErrorMessage() });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (isWorkerProcess()) {
    startDedicatedWorkerLoop();
    return;
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (!shouldRunInlineWorkers()) {
      console.log("[queue] API-only mode: run `npm run worker` to process FFmpeg jobs");
    }
  });
}

startServer();
