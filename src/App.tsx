import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState, FC } from 'react';
import { 
  Upload, 
  Layout, 
  Film, 
  ImageIcon, 
  Languages, 
  Settings, 
  Crown, 
  Sparkles, 
  Plus, 
  ChevronRight, 
  X, 
  Cloud, 
  Monitor, 
  Smartphone, 
  History, 
  Check, 
  Type, 
  Highlighter, 
  Play, 
  Pause, 
  Volume1,
  Volume2, 
  VolumeX,
  Maximize2, 
  RotateCcw, 
  RotateCw, 
  Trash2, 
  Mic, 
  Eye, 
  Zap, 
  Scissors, 
  Music,
  User as UserIcon,
  FolderPlus,
  AlertCircle,
  MessageSquare,
  Palette,
  LayoutGrid,
  Download,
  ChevronDown,
  Crop,
  Users,
  Folder,
  Library,
  TrendingUp,
  QrCode,
  ShieldCheck,
  Info,
  ArrowRight,
  HardDrive,
  Search,
  Video,
  ZoomIn,
  Replace,
  ArrowLeft,
  MoreHorizontal,
  Loader2,
  Heart,
  LogOut,
  LogIn,
  Send,
  SlidersHorizontal,
  Move,
  Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeBrolls, analyzeSilencePreview, createExportJob, createTranscriptionJob, getJobStatus, uploadRawVideoForExport } from './services/snapApi';
import { fetchLimitsMe, formatMonthlyVideoQuota, monthlyQuotaPercent, type LimitsMeResponse } from './services/limitsApi';
import { BRAND } from './lib/brand';
import { Link } from 'react-router-dom';
import { BrandKitModal } from './components/BrandKitModal';
import { TikTokPublishModal } from './components/TikTokPublishModal';
import type { BrandKit } from './services/brandApi';
import { auth, db, googleProvider, signInWithPopup, signOut } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser, signInWithRedirect } from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  orderBy,
  onSnapshot
} from 'firebase/firestore';

// --- Types ---
type AppState = 'DASHBOARD' | 'UPLOADING' | 'UPLOAD_CONFIG' | 'PROCESSING' | 'EDITOR' | 'PRICING' | 'AI_STUDIO';
type EditorTab = 'MENU' | 'CAPTIONS' | 'STYLE' | 'TEXT_TRANSFORM' | 'MAGIC_SCENES' | 'ADJUST' | 'TRANSITIONS' | 'CHAT_EDIT';
type TransitionType =
  | 'CUT'
  | 'FADE'
  | 'DISSOLVE'
  | 'WIPE_LEFT'
  | 'WIPE_RIGHT'
  | 'SLIDE_LEFT'
  | 'SLIDE_RIGHT'
  | 'ZOOM_IN'
  | 'ZOOM_OUT'
  | 'GLARE_SWEEP'
  | 'LIGHT_LEAK'
  | 'DIP_TO_WHITE'
  | 'BLOOM_BURST';

interface BrollSuggestion {
  id?: string;
  timestamp: number;
  keyword: string;
  duration?: number;
  score?: number;
  reason?: string;
}

interface BrollClip {
  id: string;
  timestamp: number;
  keyword: string;
  videoUrl: string;
  previewUrl: string;
  duration: number;
}

type ZoomType = 'NONE' | 'ZOOM_FAST' | 'CRASH_ZOOM' | 'CRASH_ZOOM_OUT' | 'FAST_SNAP' | 'FAST_HOLD' | 'SMOOTH_PULSE' | 'SMOOTH_HOLD' | 'QUICK_IN' | 'RAMP_EASE' | 'STEADY_HOLD' | 'STEADY_EASE' | 'STEADY_SNAP' | 'SMOOTH_IN' | 'SMOOTH_OUT' | 'STEADY_IN' | 'STEADY_OUT';

interface ZoomClip {
  id: string;
  timestamp: number;
  duration: number;
  type: ZoomType;
}

interface CaptionItem {
  id: string;
  start: number;
  end: number;
  text: string;
  highlight?: string;
  emoji?: string;
}

interface SilenceSegment {
  start: number;
  end: number;
}

interface CaptionTransition {
  type: TransitionType;
  updatedAt: number;
}

interface WordTiming {
  start: number;
  end: number;
  word?: string;
}

interface CustomTextOverlay {
  id: string;
  text: string;
  start: number;
  end: number;
  positionX: number;
  positionY: number;
  fontSize: number;
  color: string;
  fontWeight: string;
  fontFamily: string;
  strokeWidth: number;
  strokeColor: string;
  shadowBlur: number;
  shadowColor: string;
  uppercase: boolean;
  characterSpacing: number;
  fontSpacing: number;
  animationPreset?: 'none' | 'subtle_in' | 'slide_up' | 'slide_down' | 'fade_in' | 'fade_out' | 'typewriter';
  entryDelayMs?: number;
  entryDurationMs?: number;
  fadeOutDurationMs?: number;
  translateYFromPx?: number;
  scaleFrom?: number;
  horizontalAnchor?: 'left' | 'center' | 'right';
}

interface VideoAdjustments {
  exp: number;
  sat: number;
  tint: number;
  contrast: number;
  shadow: number;
  light: number;
  white: number;
  black: number;
  vibrance: number;
  temp: number;
}

interface TransitionPreset {
  id: TransitionType;
  name: string;
  subtitle: string;
  duration: string;
}

interface Project {
  id: string;
  name: string;
  thumbnailUrl?: string;
  duration?: number;
  videoUrl?: string;
  createdAt: number;
}

interface CaptionStyle {
  id: string;
  name: string;
  class: string;
  previewClass: string;
}

type ChatEditActionType =
  | 'MAGIC_CUT_ON'
  | 'MAGIC_CUT_OFF'
  | 'AI_CAPTION_ON'
  | 'AI_CAPTION_OFF'
  | 'SNAP_ON'
  | 'SNAP_OFF'
  | 'BROLL_AUTO'
  | 'ZOOM_AUTO'
  | 'STYLE_SET'
  | 'EXPORT_VIDEO';

interface ChatEditAction {
  type: ChatEditActionType;
  label: string;
  payload?: string;
}

interface ChatEditPlan {
  sourceMessage: string;
  actions: ChatEditAction[];
}

interface ChatEditLog {
  id: string;
  sourceMessage: string;
  actions: string[];
  createdAt: number;
  status: 'applied' | 'failed';
}

interface EditorSnapshot {
  isAiCaptionsEnabled: boolean;
  isMagicCutEnabled: boolean;
  silenceSegments: SilenceSegment[];
  isSnapStyleEnabled: boolean;
  isSnapOverlayEnabled: boolean;
  snapPaceMode: SnapPaceMode;
  selectedStyle: string;
  activeBrolls: BrollClip[];
  activeZooms: ZoomClip[];
  customTextOverlays: CustomTextOverlay[];
}

// --- Constants ---

const computeZoomScale = (activeZooms: ZoomClip[], currentTime: number) => {
    for (const zoom of activeZooms) {
        const { timestamp, duration, type } = zoom;
        const endTime = timestamp + duration;
        
        if (currentTime >= timestamp && currentTime <= endTime) {
            let scaleMax = 1.25;
            let pIn = 0.3; // default time to zoom in (seconds)
            let pOut = 0.3; // default time to zoom out (seconds)
            
            switch (type) {
                case 'CRASH_ZOOM': pIn = 0.08; pOut = 0.15; scaleMax = 1.35; break;
                case 'CRASH_ZOOM_OUT': pIn = 0.08; pOut = 0.15; scaleMax = 1.1; break;
                case 'ZOOM_FAST': pIn = 0.12; pOut = 0.15; scaleMax = 1.25; break;
                case 'FAST_SNAP': pIn = 0.05; pOut = 0.05; scaleMax = 1.25; break;
                case 'FAST_HOLD': pIn = 0.1; pOut = 0.1; scaleMax = 1.20; break;
                case 'SMOOTH_PULSE': pIn = Math.min(0.6, duration/2); pOut = Math.min(0.6, duration/2); scaleMax = 1.15; break;
                case 'SMOOTH_HOLD': pIn = 0.4; pOut = 0.3; scaleMax = 1.2; break;
                case 'STEADY_HOLD': pIn = 0.25; pOut = 0.25; scaleMax = 1.15; break;
                case 'QUICK_IN': pIn = 0.08; pOut = 0.4; scaleMax = 1.2; break;
                case 'RAMP_EASE': pIn = 0.4; pOut = 0.4; scaleMax = 1.25; break;
                default: pIn = 0.25; pOut = 0.25; scaleMax = 1.2; break;
            }
            
            // Ensure pIn and pOut fit within the duration
            pIn = Math.min(pIn, duration * 0.4);
            pOut = Math.min(pOut, duration * 0.4);

            if (currentTime < timestamp + pIn) {
                // Zooming in Phase
                const progress = (currentTime - timestamp) / pIn;
                return 1.0 + (scaleMax - 1.0) * progress;
            } else if (currentTime > endTime - pOut) {
                // Zooming out Phase
                const progress = (endTime - currentTime) / pOut;
                return 1.0 + (scaleMax - 1.0) * progress;
            } else {
                // Holding Phase
                return scaleMax;
            }
        }
    }
    return 1.0;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const DEFAULT_VIDEO_ADJUSTMENTS: VideoAdjustments = {
  exp: 0,
  sat: 0,
  tint: 0,
  contrast: 0,
  shadow: 0,
  light: 0,
  white: 0,
  black: 0,
  vibrance: 0,
  temp: 0,
};

const TRANSITION_PRESETS: TransitionPreset[] = [
  { id: 'CUT', name: 'Cut', subtitle: 'Instant hard cut', duration: '0.00s' },
  { id: 'FADE', name: 'Fade', subtitle: 'Soft crossfade', duration: '0.25s' },
  { id: 'DISSOLVE', name: 'Dissolve', subtitle: 'Film-style dissolve', duration: '0.28s' },
  { id: 'WIPE_LEFT', name: 'Wipe Left', subtitle: 'Directional wipe', duration: '0.30s' },
  { id: 'WIPE_RIGHT', name: 'Wipe Right', subtitle: 'Directional wipe', duration: '0.30s' },
  { id: 'SLIDE_LEFT', name: 'Slide Left', subtitle: 'Slide transition', duration: '0.30s' },
  { id: 'SLIDE_RIGHT', name: 'Slide Right', subtitle: 'Slide transition', duration: '0.30s' },
  { id: 'ZOOM_IN', name: 'Zoom In', subtitle: 'Punch-in cut', duration: '0.28s' },
  { id: 'ZOOM_OUT', name: 'Zoom Out', subtitle: 'Pull-out cut', duration: '0.28s' },
  { id: 'GLARE_SWEEP', name: 'Glare Sweep', subtitle: 'White flash sweep', duration: '0.30s' },
  { id: 'LIGHT_LEAK', name: 'Light Leak', subtitle: 'Warm light leak', duration: '0.40s' },
  { id: 'DIP_TO_WHITE', name: 'Dip to White', subtitle: 'White dip blend', duration: '0.22s' },
  { id: 'BLOOM_BURST', name: 'Bloom Burst', subtitle: 'Bloom burst blend', duration: '0.24s' },
];
const TEXT_ANIMATION_LIBRARY = [
  { id: 'slide_down', label: 'Slide Down' },
  { id: 'slide_up', label: 'Slide Up' },
  { id: 'fade_in', label: 'Fade In' },
  { id: 'fade_out', label: 'Fade Out' },
  { id: 'typewriter', label: 'Typewriter' },
  { id: 'subtle_in', label: 'Subtle In' },
  { id: 'none', label: 'None' },
] as const;
type TextAnimationId = (typeof TEXT_ANIMATION_LIBRARY)[number]['id'];
type SnapPaceMode = 'slow' | 'normal' | 'fast';

const SNAP_OVERLAY_ASSET = '/assets/snap/snap-black-overlay.png';

const toCssFilter = (adj: VideoAdjustments) => {
  const brightness = 1 + (adj.exp * 0.003) + (adj.light * 0.0025) + (adj.white * 0.0018) - (adj.black * 0.0018);
  const contrast = 1 + (adj.contrast * 0.006);
  const saturate = 1 + ((adj.sat + adj.vibrance * 0.6) * 0.006);
  const hueRotate = adj.tint * 0.35;
  const sepia = Math.abs(adj.temp) * 0.0035;
  return [
    `brightness(${clamp(brightness, 0.4, 1.8).toFixed(3)})`,
    `contrast(${clamp(contrast, 0.4, 1.8).toFixed(3)})`,
    `saturate(${clamp(saturate, 0, 2.4).toFixed(3)})`,
    `hue-rotate(${hueRotate.toFixed(2)}deg)`,
    `sepia(${clamp(sepia, 0, 0.35).toFixed(3)})`,
  ].join(" ");
};

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const wordCount = (value: string) => {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
};
const BROLL_STOPWORDS = new Set([
  'va', 'la', 'cho', 'nhung', 'thi', 'mot', 'nhung', 'the', 'nay', 'kia', 'roi', 'cua', 'trong', 'khi', 'voi',
  'and', 'the', 'for', 'with', 'this', 'that', 'from', 'your', 'you', 'are'
]);
const pickBrollKeywordFromCaption = (caption?: CaptionItem) => {
  if (!caption) return 'person talking';
  const highlight = String(caption.highlight || '').trim();
  if (highlight) return highlight;
  const tokens = String(caption.text || '')
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').trim())
    .filter(Boolean);
  const preferred = tokens
    .filter((w) => !BROLL_STOPWORDS.has(w.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0];
  return preferred || tokens[0] || 'person talking';
};
const normalizeToken = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
const FILLER_WORDS = new Set([
  'a', 'uh', 'um', 'erm', 'ah', 'eh', 'mm', 'hmm', 'ok', 'okay',
  'thi', 'la', 'ma', 'nhe', 'nha', 'u', 'e', 'ha', 'oi'
]);
const isLowValueCaption = (text: string, duration: number, prevText: string, nextText: string) => {
  const tokens = String(text || '').split(/\s+/).map(normalizeToken).filter(Boolean);
  if (tokens.length === 0) return true;
  const unique = new Set(tokens);
  const normalized = tokens.join(' ');
  const prevNormalized = String(prevText || '').split(/\s+/).map(normalizeToken).filter(Boolean).join(' ');
  const nextNormalized = String(nextText || '').split(/\s+/).map(normalizeToken).filter(Boolean).join(' ');
  const mostlyFiller = tokens.length <= 3 && tokens.every((t) => FILLER_WORDS.has(t));
  const heavyRepeat = tokens.length >= 2 && unique.size <= Math.max(1, Math.floor(tokens.length * 0.45));
  const nearDuplicate = Boolean(normalized && (normalized === prevNormalized || normalized === nextNormalized));
  const shortFragment = duration <= 0.55 && tokens.length <= 3;
  return mostlyFiller || (shortFragment && heavyRepeat) || (shortFragment && nearDuplicate);
};

const detectSilenceSegmentsLocal = (captions: CaptionItem[], duration: number): SilenceSegment[] => {
  if (!Array.isArray(captions) || captions.length === 0 || duration <= 0) return [];

  const sorted = captions
    .map((caption) => ({
      start: clamp(Number(caption.start || 0), 0, duration),
      end: clamp(Number(caption.end || 0), 0, duration),
      text: caption.text || "",
    }))
    .filter((caption) => caption.end > caption.start)
    .sort((a, b) => a.start - b.start);

  if (sorted.length === 0) return [];

  const gaps: number[] = [];
  let cursorForGaps = 0;
  const speechRates: number[] = [];
  for (const caption of sorted) {
    gaps.push(Math.max(0, caption.start - cursorForGaps));
    const capDuration = Math.max(0.15, caption.end - caption.start);
    speechRates.push(wordCount(caption.text || "") / capDuration);
    cursorForGaps = Math.max(cursorForGaps, caption.end);
  }
  gaps.push(Math.max(0, duration - cursorForGaps));

  const medianGap = median(gaps.filter((gap) => gap > 0.02));
  const medianSpeechRate = median(speechRates.filter((rate) => Number.isFinite(rate) && rate > 0));
  const paceBias = clamp((medianSpeechRate - 2.2) * 0.08, -0.06, 0.1);
  const padding = clamp((medianGap * 0.15 || 0.08) + paceBias, 0.03, 0.16);
  const minGap = clamp((medianGap * 0.62 || 0.24) + paceBias, 0.10, 0.85);
  const minKeepDuration = clamp(0.15 + (medianGap * 0.15), 0.15, 0.35);
  const maxCutRatio = 0.48;

  const segments: SilenceSegment[] = [];
  let cursor = 0;
  for (const caption of sorted) {
    const silenceStart = clamp(cursor + padding, 0, duration);
    const silenceEnd = clamp(caption.start - padding, 0, duration);
    if (silenceEnd - silenceStart >= minGap) {
      segments.push({ start: silenceStart, end: silenceEnd });
    }
    cursor = Math.max(cursor, caption.end);
  }

  const tailStart = clamp(cursor + padding, 0, duration);
  if (duration - tailStart >= minGap) {
    segments.push({ start: tailStart, end: duration });
  }

  for (let i = 0; i < sorted.length; i++) {
    const caption = sorted[i];
    const capDuration = Math.max(0.01, caption.end - caption.start);
    const prevText = i > 0 ? sorted[i - 1].text : '';
    const nextText = i < sorted.length - 1 ? sorted[i + 1].text : '';
    if (!isLowValueCaption(caption.text, capDuration, prevText, nextText)) continue;
    const guard = Math.min(0.08, capDuration * 0.2);
    const cutStart = clamp(caption.start + guard, 0, duration);
    const cutEnd = clamp(caption.end - guard, 0, duration);
    if (cutEnd - cutStart >= 0.08) {
      segments.push({ start: cutStart, end: cutEnd });
    }
  }

  const merged: SilenceSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (!last || segment.start > last.end + minKeepDuration) {
      merged.push(segment);
      continue;
    }
    last.end = Math.max(last.end, segment.end);
  }

  const normalized = merged.filter((segment) => segment.end - segment.start >= 0.08);
  const totalCut = normalized.reduce((acc, segment) => acc + (segment.end - segment.start), 0);
  if (totalCut <= duration * maxCutRatio) return normalized;

  const budget = duration * maxCutRatio;
  let keptCut = 0;
  return [...normalized]
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
    .filter((segment) => {
      const segmentDuration = segment.end - segment.start;
      if (keptCut + segmentDuration > budget) return false;
      keptCut += segmentDuration;
      return true;
    })
    .sort((a, b) => a.start - b.start);
};

const INITIAL_CAPTIONS: CaptionItem[] = [
  { id: '1', start: 0, end: 5.0, text: "Thriving Company không chỉ là một công ty mà là một sứ mệnh lớn lao", highlight: "Thriving Company" },
  { id: '2', start: 5.0, end: 10.0, text: "Chúng tôi xây dựng cộng đồng vững mạnh và phát triển liên tục", highlight: "cộng đồng" },
  { id: '3', start: 10.0, end: 15.0, text: "và quan trọng nhất là sẽ giúp lại những người khác", highlight: "quan trọng nhất" }
];
const CAPTION_STYLES: CaptionStyle[] = [
  { 
    id: 'iman', 
    name: 'Iman', 
    class: 'caption-iman', 
    previewClass: 'bg-zinc-900 text-white font-extrabold' 
  },
  { 
    id: 'iman2', 
    name: 'Iman 2', 
    class: 'caption-iman2', 
    previewClass: 'bg-zinc-800 text-white font-light' 
  },
  { 
    id: 'bob', 
    name: 'Bob', 
    class: 'caption-bob', 
    previewClass: 'bg-zinc-700 text-white font-medium border-2 border-red-500' 
  },
  { 
    id: 'hormozi', 
    name: 'Hormozi', 
    class: 'caption-hormozi', 
    previewClass: 'bg-[#FFD93D] text-black font-black italic uppercase' 
  },
  {
    id: 'alex',
    name: 'Alex',
    class: 'caption-alex',
    previewClass: 'bg-zinc-900 text-white font-extrabold uppercase'
  },
  {
    id: 'beast',
    name: 'Mr. Beast',
    class: 'caption-beast',
    previewClass: 'bg-blue-500 text-yellow-300 font-black italic shadow-lg'
  },
  {
    id: 'ali',
    name: 'Ali Abdaal',
    class: 'caption-ali',
    previewClass: 'bg-zinc-50 text-zinc-900 font-serif'
  }
];

const AI_TOOLS = [
  { id: 'captions', label: 'AI Captions', icon: Type, color: 'text-zinc-900', desc: 'Auto subtitles' },
  { id: 'zooms', label: 'AI Auto Zooms', icon: Sparkles, color: 'text-zinc-900', desc: 'Dynamic camera' },
  { id: 'brolls', label: 'AI Auto B-rolls', icon: Film, color: 'text-zinc-900', desc: 'Stock footage' },
  { id: 'silence', label: 'Silence Preview', icon: Mic, color: 'text-zinc-900', desc: 'Preview pacing cuts' },
];

const IMAN2_PRESET = {
  fontSize: 48,
  positionY: 70,
  positionX: 50,
  primaryColor: '#ffffff',
  strokeWidth: 0,
  strokeColor: '#000000',
  shadowBlur: 0,
  shadowColor: '#000000',
  uppercase: false,
  fontWeight: '900',
  fontFamily: 'Montserrat',
  displayWords: 3,
  animation: true,
  punctuation: true,
  autoEmoji: 'Auto',
  breakLines: true,
  gapFree: true,
  secondColor: '#ffffff',
  thirdColor: '#ffffff',
  emphasizedColor: '#ffffff',
  emphasizedBackground: 'transparent',
  captionAnimation: 'fade in',
  wordAnimation: 'None',
  animationVariants: true,
  videoBackground: '#000000'
} as const;

const getAnimationProgress = (currentTimeSec: number, startSec: number, durationMs: number) => {
  const durationSec = Math.max(0.06, durationMs / 1000);
  return Math.max(0, Math.min(1, (currentTimeSec - startSec) / durationSec));
};

const SNAP_PACE_CONFIG: Record<SnapPaceMode, {
  entryRatio: number;
  exitRatio: number;
  minSingle: number;
  minTwo: number;
  minThree: number;
}> = {
  slow: { entryRatio: 0.24, exitRatio: 0.18, minSingle: 1.1, minTwo: 1.65, minThree: 2.2 },
  normal: { entryRatio: 0.28, exitRatio: 0.16, minSingle: 0.95, minTwo: 1.45, minThree: 1.95 },
  fast: { entryRatio: 0.32, exitRatio: 0.14, minSingle: 0.8, minTwo: 1.25, minThree: 1.65 },
};
const SNAP_SEGMENTATION_VERSION = 1;

const VN_JOIN_PHRASES = new Set([
  'sau này', 'giàu lên', 'đừng quên', 'nhớ là', 'bây giờ', 'thế nào', 'bao giờ', 'tại sao',
  'how to', 'right now', 'you know', 'look at',
]);
const VN_LEADING_HOOK = new Set(['nếu', 'khi', 'vì', 'nên', 'thì', 'còn', 'mà']);
const VN_WEAK_WORDS = new Set(['là', 'thì', 'mà', 'và', 'ơi', 'à', 'ha', 'nhé', 'nha']);
const VN_DEEMPHASIZE_HEAD = new Set(['thì', 'là', 'mà', 'và', 'ừ', 'ờ', 'à', 'ơ']);
const VN_PROTECTED_BIGRAMS = new Set([
  'đừng quên', 'nhớ là', 'những lời', 'lời thề', 'thề hẹn', 'sau này', 'giàu lên',
  'bây giờ', 'thế nào', 'bao giờ', 'tại sao', 'how to', 'right now',
]);
const VN_PROTECTED_TRIGRAMS = new Set([
  'những lời thề', 'lời thề hẹn', 'đừng quên những', 'sau này bạn', 'bạn giàu lên',
]);
const normalizeWord = (w: string) =>
  String(w || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

const normalizeTokenForLayer = (word: string) =>
  String(word || '')
    .replace(/^[^\p{L}\p{N}]+/gu, '')
    .replace(/[^\p{L}\p{N}]+$/gu, '')
    .trim();

const estimateTextWidthPx = (text: string, fontSize: number, fontWeight: string | number, characterSpacing = 0) => {
  const content = String(text || '').trim();
  if (!content) return 0;
  const weight = Number(fontWeight) >= 700 ? 700 : 500;
  const font = `${weight} ${Math.max(8, fontSize)}px "SF Pro Display", sans-serif`;
  let measured = 0;

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = font;
      measured = ctx.measureText(content).width;
    }
  }

  if (!measured || !Number.isFinite(measured)) {
    // Fallback approximation (VN/Latin mixed)
    measured = content.length * fontSize * 0.56;
  }

  const spacingExtra = Math.max(0, content.length - 1) * characterSpacing;
  return Math.max(0, measured + spacingExtra);
};

const applySnapLexicalRepair = (inputWords: string[]) => {
  const words = [...inputWords];
  for (let i = 0; i < words.length - 2; i++) {
    const w1 = normalizeWord(words[i] || '');
    const w2 = normalizeWord(words[i + 1] || '');
    const w3 = normalizeWord(words[i + 2] || '');
    // Common colloquial phrase repair: "nhớ là quên" -> "nhớ là đừng quên"
    if (w1 === 'nho' && w2 === 'la' && w3 === 'quen') {
      words.splice(i + 2, 0, 'đừng');
      i += 1;
    }
  }
  return words;
};

const countBoundaryPhraseBreak = (words: string[], boundaryIndex: number) => {
  // boundaryIndex splits: left [0..boundaryIndex-1], right [boundaryIndex..]
  let penalty = 0;
  const left1 = normalizeWord(words[boundaryIndex - 1] || '');
  const right1 = normalizeWord(words[boundaryIndex] || '');
  if (left1 && right1) {
    const bi = `${left1} ${right1}`;
    if (VN_PROTECTED_BIGRAMS.has(bi)) penalty += 3.8;
  }

  const left2 = normalizeWord(words[boundaryIndex - 2] || '');
  if (left2 && left1 && right1) {
    const tri = `${left2} ${left1} ${right1}`;
    if (VN_PROTECTED_TRIGRAMS.has(tri)) penalty += 4.2;
  }
  const right2 = normalizeWord(words[boundaryIndex + 1] || '');
  if (left1 && right1 && right2) {
    const tri = `${left1} ${right1} ${right2}`;
    if (VN_PROTECTED_TRIGRAMS.has(tri)) penalty += 4.2;
  }
  return penalty;
};

const splitWordsIntoLayersFromTokens = (tokens: string[]) => {
  let words = tokens.map((w) => normalizeTokenForLayer(w)).filter(Boolean);
  words = applySnapLexicalRepair(words);
  const firstHookIndex = words.findIndex((w) => VN_LEADING_HOOK.has(normalizeWord(w)));
  if (firstHookIndex > 0) {
    const leading = words.slice(0, firstHookIndex);
    if (leading.every((w) => VN_DEEMPHASIZE_HEAD.has(normalizeWord(w)))) {
      words = words.slice(firstHookIndex);
    }
  }
  const n = words.length;
  if (n <= 1) return [words.join(' '), '', ''];
  if (n === 2) return [words[0], words[1], ''];
  if (n === 3) return [words[0], words[1], words[2]];

  const firstNorm = normalizeWord(words[0] || '');
  if (VN_LEADING_HOOK.has(firstNorm) && n >= 5) {
    const rem = words.slice(1);
    const cut = rem.length >= 5 ? 2 : Math.min(2, rem.length - 1);
    return [words[0], rem.slice(0, cut).join(' '), rem.slice(cut).join(' ')];
  }

  let best: [string, string, string] | null = null;
  let bestScore = -Infinity;

  for (let i = 1; i <= n - 2; i++) {
    for (let j = i + 1; j <= n - 1; j++) {
      const c1 = words.slice(0, i);
      const c2 = words.slice(i, j);
      const c3 = words.slice(j);
      const chunks = [c1, c2, c3];
      if (chunks.some((c) => c.length === 0)) continue;

      const lens = chunks.map((c) => c.length);
      const [l1, l2, l3] = lens;

      let score = 0;
      score -= Math.abs(l1 - 1.5) * 1.9;
      score -= Math.abs(l2 - 2.2) * 1.3;
      score -= Math.abs(l3 - 2.6) * 1.1;

      const chunkTexts = chunks.map((c) => c.map(normalizeWord).join(' '));
      for (const text of chunkTexts) {
        if (VN_JOIN_PHRASES.has(text)) score += 2.8;
        if (text.split(' ').length >= 2) {
          const parts = text.split(' ');
          for (let k = 0; k < parts.length - 1; k++) {
            const bi = `${parts[k]} ${parts[k + 1]}`;
            if (VN_JOIN_PHRASES.has(bi)) score += 1.5;
          }
        }
      }

      if (VN_LEADING_HOOK.has(normalizeWord(c1[0])) && c1.length <= 2) score += 2.4;
      if (VN_WEAK_WORDS.has(normalizeWord(c2[c2.length - 1]))) score -= 1.8;
      if (VN_WEAK_WORDS.has(normalizeWord(c3[0]))) score -= 1.4;
      if (VN_DEEMPHASIZE_HEAD.has(normalizeWord(c1[0]))) score -= 2.6;
      if (VN_DEEMPHASIZE_HEAD.has(normalizeWord(c2[0]))) score -= 1.6;
      score -= countBoundaryPhraseBreak(words, i);
      score -= countBoundaryPhraseBreak(words, j);

      if (l2 < l1) score -= 1.0;
      if (l3 === 1) score -= 0.8;
      if (l2 >= 2 && l2 <= 4) score += 0.8; // keep highlight chunk readable
      if (l3 >= 2 && l3 <= 4) score += 0.45;

      if (score > bestScore) {
        bestScore = score;
        best = [c1.join(' '), c2.join(' '), c3.join(' ')];
      }
    }
  }

  if (best) return best;
  const fallbackA = Math.max(1, Math.round(n * 0.3));
  const fallbackB = Math.max(fallbackA + 1, Math.round(n * 0.62));
  return [
    words.slice(0, fallbackA).join(' '),
    words.slice(fallbackA, fallbackB).join(' '),
    words.slice(fallbackB).join(' '),
  ];
};

const splitWordsIntoLayers = (input: string) => {
  const rawWords = String(input || '').trim().split(/\s+/).filter(Boolean);
  return splitWordsIntoLayersFromTokens(rawWords);
};

interface SnapWordUnit {
  start: number;
  end: number;
  text: string;
  words: string[];
}

const buildSnapWordUnits = (sourceWords: WordTiming[], totalDurationSec: number): SnapWordUnit[] => {
  const words = sourceWords
    .map((w) => ({
      start: Math.max(0, Number(w.start || 0)),
      end: Math.max(0, Number(w.end || 0)),
      word: String(w.word || '').trim(),
    }))
    .filter((w) => w.end > w.start && w.word.length > 0)
    .sort((a, b) => a.start - b.start);

  if (words.length === 0) return [];

  const units: SnapWordUnit[] = [];
  let chunk: typeof words = [];
  const maxWordsPerUnit = 8;
  const hardPauseGapSec = 0.38;
  const softPauseGapSec = 0.24;

  const flushChunk = () => {
    if (chunk.length === 0) return;
    const normalized = chunk.map((item) => normalizeTokenForLayer(item.word)).filter(Boolean);
    if (normalized.length === 0) {
      chunk = [];
      return;
    }
    const start = chunk[0].start;
    const end = Math.min(
      Math.max(start + 0.22, chunk[chunk.length - 1].end),
      Math.max(0.6, totalDurationSec || chunk[chunk.length - 1].end + 0.3),
    );
    units.push({
      start,
      end,
      words: normalized,
      text: normalized.join(' '),
    });
    chunk = [];
  };

  for (let i = 0; i < words.length; i++) {
    const current = words[i];
    const next = words[i + 1];
    chunk.push(current);

    const cleaned = normalizeTokenForLayer(current.word);
    const punctuationBreak = /[.!?;:]/.test(current.word);
    const gapNext = next ? Math.max(0, next.start - current.end) : 0;
    const currentNorm = normalizeWord(cleaned);
    const nextNorm = normalizeWord(next?.word || '');
    const preserveConnector = VN_WEAK_WORDS.has(currentNorm) || VN_WEAK_WORDS.has(nextNorm);
    const preserveJoinPair = VN_PROTECTED_BIGRAMS.has(`${currentNorm} ${nextNorm}`);
    const hardPause = !!next && gapNext >= hardPauseGapSec && !preserveJoinPair;
    const softPause = !!next && gapNext >= softPauseGapSec && chunk.length >= 3 && !preserveConnector && !preserveJoinPair;
    const tooLong = chunk.length >= maxWordsPerUnit;
    const endOfStream = !next;
    const tailWord = normalizeWord(cleaned);
    const hookEnd = VN_LEADING_HOOK.has(tailWord) && chunk.length >= 2;

    if (punctuationBreak || hardPause || softPause || tooLong || endOfStream || hookEnd) {
      flushChunk();
    }
  }

  const nonOverlapped: SnapWordUnit[] = [];
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const next = units[i + 1];
    let end = unit.end;
    if (next) {
      end = Math.min(end, Math.max(unit.start + 0.18, next.start - 0.02));
    }
    nonOverlapped.push({ ...unit, end });
  }

  const compact = nonOverlapped.filter((unit) => unit.end - unit.start >= 0.16);
  const mergedTiny: SnapWordUnit[] = [];
  for (const unit of compact) {
    const last = mergedTiny[mergedTiny.length - 1];
    if (
      last &&
      (last.words.length <= 1 || unit.words.length <= 1) &&
      (unit.start - last.end) < 0.12 &&
      (last.words.length + unit.words.length) <= maxWordsPerUnit
    ) {
      last.end = Math.max(last.end, unit.end);
      last.words = [...last.words, ...unit.words];
      last.text = last.words.join(' ');
    } else {
      mergedTiny.push({ ...unit, words: [...unit.words] });
    }
  }
  return mergedTiny;
};

const cloneCustomTextOverlays = (source: CustomTextOverlay[]) => source.map((item) => ({ ...item }));

const buildTranscriptSignature = (sourceCaptions: CaptionItem[], sourceWords: WordTiming[], totalDurationSec: number) => {
  const wordsSig = sourceWords.length > 0
    ? sourceWords
        .slice(0, 220)
        .map((w) => `${Number(w.start || 0).toFixed(2)}-${Number(w.end || 0).toFixed(2)}:${normalizeWord(w.word || '')}`)
        .join('|')
    : '';
  const captionsSig = sourceCaptions
    .slice(0, 120)
    .map((c) => `${Number(c.start || 0).toFixed(2)}-${Number(c.end || 0).toFixed(2)}:${normalizeWord(c.text || '')}`)
    .join('|');
  return `${sourceWords.length}|${sourceCaptions.length}|${Number(totalDurationSec || 0).toFixed(2)}|${wordsSig}|${captionsSig}`;
};

// --- Firestore Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

import { searchPexelsVideos, PexelsVideo } from './services/pexelsService';

export default function App() {
  const [pexelsQuery, setPexelsQuery] = useState('');
  const [pexelsResults, setPexelsResults] = useState<PexelsVideo[]>([]);
  const [isSearchingPexels, setIsSearchingPexels] = useState(false);
  const [showPexelsPanel, setShowPexelsPanel] = useState(false);
  const [captionBrollQuery, setCaptionBrollQuery] = useState('');
  const [captionBrollResults, setCaptionBrollResults] = useState<PexelsVideo[]>([]);
  const [isSearchingCaptionBroll, setIsSearchingCaptionBroll] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [appState, setAppState] = useState<AppState>('DASHBOARD');
  const [activeTab, setActiveTab] = useState<EditorTab>('MENU');
  const [selectedStyle, setSelectedStyle] = useState<string>('iman2');
  const [progress, setProgress] = useState(0);
  const [progressTarget, setProgressTarget] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>('https://videos.pexels.com/video-files/4069480/4069480-sd_540_960_25fps.mp4'); 
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoomPickerCaptionId, setZoomPickerCaptionId] = useState<string | null>(null);
  const [brollPickerCaptionId, setBrollPickerCaptionId] = useState<string | null>(null);
  const [transitionPickerCaptionId, setTransitionPickerCaptionId] = useState<string | null>(null);
  const [captionTransitions, setCaptionTransitions] = useState<Record<string, CaptionTransition>>({});
  const [language, setLanguage] = useState('Vietnamese');
  const [captions, setCaptions] = useState<CaptionItem[]>(INITIAL_CAPTIONS);
  const [projects, setProjects] = useState<Project[]>([]);
  const [brollSuggestions, setBrollSuggestions] = useState<BrollSuggestion[]>([]);
  const [activeBrolls, setActiveBrolls] = useState<BrollClip[]>([]);
  const [activeZooms, setActiveZooms] = useState<ZoomClip[]>([]);
  const [isAnalyzingZooms, setIsAnalyzingZooms] = useState(false);
  const captionsRef = useRef(captions);
  useEffect(() => { captionsRef.current = captions; }, [captions]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzingBrolls, setIsAnalyzingBrolls] = useState(false);
  const [isApplyingAutoBrollPlan, setIsApplyingAutoBrollPlan] = useState(false);
  const [jobStatus, setJobStatus] = useState<string>('');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportProgressTarget, setExportProgressTarget] = useState(0);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [pendingChatPlan, setPendingChatPlan] = useState<ChatEditPlan | null>(null);
  const [isApplyingChatPlan, setIsApplyingChatPlan] = useState(false);
  const [chatEditLogs, setChatEditLogs] = useState<ChatEditLog[]>([]);
  const [chatEditHistory, setChatEditHistory] = useState<EditorSnapshot[]>([]);
  const [chatEditFuture, setChatEditFuture] = useState<EditorSnapshot[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isLocalDevHost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ type, message });
    window.setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const normalizeUserErrorMessage = (rawError: unknown, fallback: string) => {
    const message = String((rawError as any)?.message || rawError || '').trim();
    if (!message) return fallback;
    const lowered = message.toLowerCase();

    if (lowered.includes('Bạn cần đăng nhập'.toLowerCase()) || lowered.includes('missing_auth_token') || lowered.includes('unauthorized')) {
      return 'Bạn cần đăng nhập để dùng tính năng này.';
    }
    if (lowered.includes('quota') || lowered.includes('insufficient_quota') || lowered.includes('hết credits')) {
      return 'Tài khoản AI hiện đã hết hạn mức. Vui lòng nạp thêm credits hoặc đổi API key còn số dư.';
    }
    if (lowered.includes('api key') || lowered.includes('openai_api_key') || lowered.includes('gemini_api_key')) {
      return 'API key chưa đúng hoặc chưa cấu hình. Hãy kiểm tra lại mục Secrets rồi thử lại.';
    }
    if (lowered.includes('default credentials')) {
      return 'Server chưa cấu hình tài khoản dịch vụ Google/Firebase cho môi trường hiện tại.';
    }
    if (lowered.includes('ffprobe') || lowered.includes('ffmpeg')) {
      return 'Máy chủ media đang thiếu công cụ xử lý video. Vui lòng thử lại sau ít phút.';
    }
    if (lowered.includes('video quá lớn') || lowered.includes('413') || lowered.includes('vượt giới hạn')) {
      return 'Video vượt giới hạn dung lượng hoặc thời lượng của gói hiện tại.';
    }
    if (lowered.includes('network') || lowered.includes('failed to fetch') || lowered.includes('mất kết nối') || lowered.includes('timeout')) {
      return 'Kết nối tới máy chủ đang gián đoạn. Vui lòng thử lại.';
    }
    if (lowered.includes('thất lạc jobid')) {
      return 'Tiến trình xử lý đã hết hạn hoặc không còn tồn tại. Hãy chạy lại tác vụ.';
    }
    if (message.length > 220) {
      return fallback;
    }
    return message;
  };

  const mapTranscribeProgressTarget = (status: string, reportedProgress: number, queuePos?: number | null) => {
    const safeReported = Math.max(0, Math.min(100, Number(reportedProgress || 0)));
    if (!status) return Math.max(6, safeReported);
    if (status.startsWith('Đang tải video lên máy chủ...')) return Math.max(8, Math.min(40, safeReported || 12));
    if (status.startsWith('Đang tải video lên kho lưu trữ...')) return Math.max(10, Math.min(38, safeReported || 14));
    if (status === 'Đang khởi tạo tiến trình AI...') return 42;
    if (status === 'queued') return queuePos ? Math.min(52, 44 + Math.min(queuePos, 8)) : 45;
    if (status === 'downloading') return Math.max(48, safeReported || 50);
    if (status === 'extracting') return Math.max(56, safeReported || 58);
    if (status === 'chunking_audio') return Math.max(68, safeReported || 70);
    if (status === 'transcribing') return Math.max(74, Math.min(94, safeReported || 80));
    if (status === 'processing' || status === 'retrying') return Math.max(86, Math.min(96, safeReported || 88));
    if (status === 'done') return 100;
    return Math.max(6, safeReported);
  };

  const mapExportProgressTarget = (status: string, reportedProgress: number, queuePos?: number | null) => {
    const safeReported = Math.max(0, Math.min(100, Number(reportedProgress || 0)));
    if (!status) return Math.max(4, safeReported);
    if (status.startsWith('Đang chuẩn bị file cho xuất video')) {
      return Math.max(6, Math.min(22, safeReported || 8));
    }
    if (status === 'queued') return queuePos ? Math.min(24, 10 + Math.min(queuePos, 7) * 2) : 12;
    if (status === 'retrying_full_pipeline') return Math.max(56, Math.min(92, safeReported || 58));
    if (status === 'processing' || status === 'retrying') return Math.max(18, safeReported || 20);
    if (status === 'downloading_main') return Math.max(22, safeReported || 24);
    if (status === 'downloading_brolls' || status.startsWith('downloading_broll_')) return Math.max(28, Math.min(40, safeReported || 30));
    if (status === 'creating_subtitles') return Math.max(42, safeReported || 45);
    if (status === 'rendering_video') return Math.max(50, Math.min(96, safeReported || 55));
    if (status === 'uploading_result') return Math.max(96, Math.min(99, safeReported || 97));
    if (status === 'done') return 100;
    return Math.max(4, safeReported);
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        const target = Math.max(prev, progressTarget);
        if (target <= prev) return prev;
        const delta = target - prev;
        const step = delta > 25 ? 6 : delta > 12 ? 3 : 1.2;
        return Math.min(target, prev + step);
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [progressTarget]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setExportProgress((prev) => {
        const target = Math.max(prev, exportProgressTarget);
        if (target <= prev) return prev;
        const delta = target - prev;
        const step = delta > 25 ? 5 : delta > 10 ? 2.5 : 1;
        return Math.min(target, prev + step);
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [exportProgressTarget]);

  const getAuthHeaders = async () => {
    if (!user) {
      if (isLocalDevHost) {
        return {};
      }
      throw new Error("Bạn cần đăng nhập để sử dụng tính năng này.");
    }
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  };

  const getOptionalAuthHeaders = async () => {
    if (!user) return {};
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  };

  const refreshQuota = async () => {
    try {
      const headers = await getOptionalAuthHeaders();
      if (!headers.Authorization && !isLocalDevHost) {
        setQuota(null);
        return;
      }
      const data = await fetchLimitsMe(headers);
      setQuota(data);
      if (data.plan === 'BASIC' || data.plan === 'PRO') {
        setPlan(data.plan);
      }
    } catch {
      setQuota(null);
    }
  };

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isAiTyping]);

  const toggleChatSidebar = () => {
    if (activeTab === 'CHAT_EDIT') {
      setActiveTab('MENU');
      setIsAIChatOpen(false);
      return;
    }
    setIsAIChatOpen(true);
    setActiveTab('CHAT_EDIT');
  };

  useEffect(() => {
    if (activeTab !== 'CHAT_EDIT' && isAIChatOpen) {
      setIsAIChatOpen(false);
    }
  }, [activeTab, isAIChatOpen]);

  const takeEditorSnapshot = (): EditorSnapshot => ({
    isAiCaptionsEnabled,
    isMagicCutEnabled,
    silenceSegments: silenceSegments.map((item) => ({ ...item })),
    isSnapStyleEnabled,
    isSnapOverlayEnabled,
    snapPaceMode,
    selectedStyle,
    activeBrolls: activeBrolls.map((item) => ({ ...item })),
    activeZooms: activeZooms.map((item) => ({ ...item })),
    customTextOverlays: customTextOverlays.map((item) => ({ ...item })),
  });

  const restoreEditorSnapshot = (snapshot: EditorSnapshot) => {
    setIsAiCaptionsEnabled(snapshot.isAiCaptionsEnabled);
    setIsMagicCutEnabled(snapshot.isMagicCutEnabled);
    setSilenceSegments(snapshot.silenceSegments.map((item) => ({ ...item })));
    setIsSnapStyleEnabled(snapshot.isSnapStyleEnabled);
    setIsSnapOverlayEnabled(snapshot.isSnapOverlayEnabled);
    setSnapPaceMode(snapshot.snapPaceMode);
    setSelectedStyle(snapshot.selectedStyle);
    setActiveBrolls(snapshot.activeBrolls.map((item) => ({ ...item })));
    setActiveZooms(snapshot.activeZooms.map((item) => ({ ...item })));
    setCustomTextOverlays(snapshot.customTextOverlays.map((item) => ({ ...item })));
  };

  const commitChatEditHistory = () => {
    const snapshot = takeEditorSnapshot();
    setChatEditHistory((prev) => [...prev.slice(-49), snapshot]);
    setChatEditFuture([]);
  };

  const undoLastChatEditAction = () => {
    setChatEditHistory((prev) => {
      if (prev.length === 0) return prev;
      const previous = prev[prev.length - 1];
      setChatEditFuture((future) => [...future.slice(-49), takeEditorSnapshot()]);
      restoreEditorSnapshot(previous);
      return prev.slice(0, -1);
    });
  };

  const redoLastChatEditAction = () => {
    setChatEditFuture((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setChatEditHistory((history) => [...history.slice(-49), takeEditorSnapshot()]);
      restoreEditorSnapshot(next);
      return prev.slice(0, -1);
    });
  };

  const parseKeywordChatPlan = (input: string): ChatEditPlan | null => {
    const lowered = input.toLowerCase();
    const actions: ChatEditAction[] = [];
    const pushUnique = (action: ChatEditAction) => {
      if (!actions.some((item) => item.type === action.type && item.payload === action.payload)) {
        actions.push(action);
      }
    };

    if (lowered.includes('cắt im lặng') || lowered.includes('remove silence') || lowered.includes('magic cut')) {
      pushUnique({ type: 'MAGIC_CUT_ON', label: 'Bật Remove Silence (Magic Cut)' });
    } else if (lowered.includes('tắt cắt') || lowered.includes('tắt magic cut') || lowered.includes('tắt remove silence')) {
      pushUnique({ type: 'MAGIC_CUT_OFF', label: 'Tắt Remove Silence (Magic Cut)' });
    }

    if (lowered.includes('bật caption') || lowered.includes('thêm caption') || lowered.includes('phụ đề')) {
      pushUnique({ type: 'AI_CAPTION_ON', label: 'Bật AI Caption' });
    } else if (lowered.includes('tắt caption') || lowered.includes('ẩn caption')) {
      pushUnique({ type: 'AI_CAPTION_OFF', label: 'Tắt AI Caption' });
    }

    if (
      lowered.includes('bật snap')
      || lowered.includes('snap mode')
      || lowered.includes('snap style')
      || lowered.includes('bật everysunday')
      || lowered.includes('everysunday style')
    ) {
      pushUnique({ type: 'SNAP_ON', label: `Bật ${BRAND.styleFeatureName}` });
    } else if (lowered.includes('tắt snap') || lowered.includes('tắt everysunday')) {
      pushUnique({ type: 'SNAP_OFF', label: `Tắt ${BRAND.styleFeatureName}` });
    }

    if (lowered.includes('b-roll') || lowered.includes('broll')) {
      pushUnique({ type: 'BROLL_AUTO', label: 'Phân tích và thêm Auto B-roll' });
    }

    if (lowered.includes('zoom')) {
      pushUnique({ type: 'ZOOM_AUTO', label: 'Tạo Auto Zoom' });
    }

    const styleMap: Array<{ id: string; keys: string[]; label: string }> = [
      { id: 'iman2', keys: ['iman 2', 'iman2'], label: 'Đổi style caption: Iman 2' },
      { id: 'alex', keys: ['alex'], label: 'Đổi style caption: Alex' },
      { id: 'mrbeast', keys: ['mr beast', 'beast'], label: 'Đổi style caption: Mr. Beast' },
      { id: 'hormozi', keys: ['hormozi'], label: 'Đổi style caption: Hormozi' },
      { id: 'bob', keys: ['bob'], label: 'Đổi style caption: Bob' },
      { id: 'aliabdaal', keys: ['ali abdaal', 'ali'], label: 'Đổi style caption: Ali Abdaal' },
    ];
    for (const style of styleMap) {
      if (style.keys.some((key) => lowered.includes(key))) {
        pushUnique({ type: 'STYLE_SET', label: style.label, payload: style.id });
        break;
      }
    }

    if (lowered.includes('xuất video') || lowered.includes('export')) {
      pushUnique({ type: 'EXPORT_VIDEO', label: 'Xuất video' });
    }

    if (actions.length === 0) return null;
    return { sourceMessage: input, actions };
  };

  const summarizeChatPlan = (plan: ChatEditPlan) => {
    const lines = plan.actions.map((action, index) => `${index + 1}. ${action.label}`);
    return `Mình hiểu yêu cầu. Mình sẽ thực hiện:\n${lines.join('\n')}\n\nNhấn "Áp dụng" để chạy tự động.`;
  };

  const applyChatAction = async (action: ChatEditAction) => {
    switch (action.type) {
      case 'MAGIC_CUT_ON':
        if (!isMagicCutEnabled) await handleMagicCut();
        return;
      case 'MAGIC_CUT_OFF':
        if (isMagicCutEnabled) await handleMagicCut();
        return;
      case 'AI_CAPTION_ON':
        setIsAiCaptionsEnabled(true);
        return;
      case 'AI_CAPTION_OFF':
        setIsAiCaptionsEnabled(false);
        return;
      case 'SNAP_ON':
        handleSnapEdit();
        return;
      case 'SNAP_OFF':
        setIsSnapStyleEnabled(false);
        setIsSnapOverlayEnabled(false);
        setCustomTextOverlays((prev) => prev.filter((item) => !item.id.startsWith('snap_pod_')));
        return;
      case 'BROLL_AUTO':
        await handleGenerateBrolls({ useCraft: true, autoApply: true });
        return;
      case 'ZOOM_AUTO':
        handleGenerateZooms();
        return;
      case 'STYLE_SET':
        if (action.payload) await handleCaptionStyleSelect(action.payload);
        return;
      case 'EXPORT_VIDEO':
        await handleExport();
        return;
      default:
        return;
    }
  };

  const applyPendingChatPlan = async () => {
    if (!pendingChatPlan || isApplyingChatPlan) return;
    commitChatEditHistory();
    setIsApplyingChatPlan(true);
    setIsAiTyping(true);
    try {
      for (const action of pendingChatPlan.actions) {
        await applyChatAction(action);
      }
      setChatEditLogs((prev) => [{
        id: `${Date.now()}`,
        sourceMessage: pendingChatPlan.sourceMessage,
        actions: pendingChatPlan.actions.map((item) => item.label),
        createdAt: Date.now(),
        status: 'applied',
      }, ...prev].slice(0, 40));
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Đã áp dụng xong các thay đổi vào timeline.' }]);
      notify('Đã áp dụng lệnh Chat Edit.', 'success');
      setPendingChatPlan(null);
    } catch (error) {
      console.error('Apply chat plan failed:', error);
      setChatEditLogs((prev) => [{
        id: `${Date.now()}`,
        sourceMessage: pendingChatPlan.sourceMessage,
        actions: pendingChatPlan.actions.map((item) => item.label),
        createdAt: Date.now(),
        status: 'failed',
      }, ...prev].slice(0, 40));
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Có lỗi khi áp dụng lệnh chat. Bạn có thể thử lại hoặc chỉnh tay.' }]);
      notify('Áp dụng lệnh chat thất bại.', 'error');
    } finally {
      setIsAiTyping(false);
      setIsApplyingChatPlan(false);
    }
  };

  const cancelPendingChatPlan = () => {
    if (!pendingChatPlan) return;
    setPendingChatPlan(null);
    setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Đã huỷ kế hoạch thay đổi vừa đề xuất.' }]);
  };

  const sendMessageToAI = async () => {
    if (!chatInput.trim() || isAiTyping) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsAiTyping(true);

    try {
      const localPlan = parseKeywordChatPlan(userMessage);
      if (localPlan) {
        setPendingChatPlan(localPlan);
        setChatMessages((prev) => [...prev, { role: 'assistant', content: summarizeChatPlan(localPlan) }]);
        return;
      }
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          message: userMessage,
          messages: chatMessages
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Không thể kết nối với AI.");
      }

      const serverPlan = data?.plan;
      if (serverPlan && Array.isArray(serverPlan.actions) && serverPlan.actions.length > 0) {
        setPendingChatPlan(serverPlan as ChatEditPlan);
      }
      const aiText = data.text || "Xin lỗi, tôi không thể trả lời lúc này.";
      setChatMessages(prev => [...prev, { role: 'assistant', content: aiText }]);
    } catch (error) {
      console.error("AI Chat Error:", error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Có lỗi xảy ra khi kết nối với AI. Vui lòng thử lại sau." }]);
    } finally {
      setIsAiTyping(false);
    }
  };
  
  const [volume, setVolume] = useState(0.8);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [plan, setPlan] = useState<'FREE' | 'BASIC' | 'PRO'>('FREE');
  const [quota, setQuota] = useState<LimitsMeResponse | null>(null);

  // --- Auth & Data Sync ---
  useEffect(() => {
    let unsubUser: (() => void) | undefined;
    
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);

      if (firebaseUser) {
        // Sync User Data (Using onSnapshot for real-time updates like webhook payments)
        const userRef = doc(db, 'users', firebaseUser.uid);
        unsubUser = onSnapshot(userRef, async (userSnap) => {
          if (userSnap.exists()) {
            const userData = userSnap.data();
            setPlan(userData.plan || 'FREE');
            
            // Avoid infinite loops: only update lastLogin occasionally
            if (!userData.lastLogin || Date.now() - userData.lastLogin > 86400000) {
              await updateDoc(userRef, { lastLogin: Date.now() }).catch(e => console.error("Error updating lastLogin", e));
            }
          } else {
            // First time user
            const safeEmail = firebaseUser.email || `${firebaseUser.uid}@${BRAND.localEmailDomain}`;
            const newUser = {
              email: safeEmail,
              plan: 'FREE',
              createdAt: Date.now(),
              lastLogin: Date.now()
            };
            await setDoc(userRef, newUser).catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${firebaseUser.uid}`));
            setPlan('FREE');
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        });
      } else {
        // Reset state on logout
        if (unsubUser) {
          unsubUser();
          unsubUser = undefined;
        }
        setProjects([]);
        setPlan('FREE');
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubUser) unsubUser();
    };
  }, []);

  // Listen for projects when logged in
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projectsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Project[];
      setProjects(projectsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    refreshQuota();
  }, [user, authLoading]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [appState]);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<'BASIC' | 'PRO' | null>(null);
  const [isBrandKitOpen, setIsBrandKitOpen] = useState(false);
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [isTikTokPublishOpen, setIsTikTokPublishOpen] = useState(false);
  const [lastExportUrl, setLastExportUrl] = useState<string | null>(null);

  const handleUpgradeClick = (planType: 'BASIC' | 'PRO') => {
    setSelectedPlanForPayment(planType);
    setIsPaymentModalOpen(true);
  };

  const handlePexelsSearch = async () => {
    if (!pexelsQuery.trim()) return;
    setIsSearchingPexels(true);
    try {
      const optionalHeaders = await getOptionalAuthHeaders();
      const token = optionalHeaders.Authorization ? optionalHeaders.Authorization.replace("Bearer ", "") : undefined;
      const results = await searchPexelsVideos(pexelsQuery, 15, token);
      setPexelsResults(results);
    } catch (err: any) {
      console.error(err);
      notify(normalizeUserErrorMessage(err, "Không thể tìm kiếm Pexels lúc này."), "error");
    } finally {
      setIsSearchingPexels(false);
    }
  };

  const handleAddPexelsBroll = (video: PexelsVideo) => {
    const bestFile = video.video_files.find(f => f.quality === 'hd') || video.video_files[0];
    const newBroll: BrollClip = {
      id: Date.now().toString(),
      videoUrl: bestFile.link,
      previewUrl: video.image,
      keyword: pexelsQuery || 'pexels',
      timestamp: videoRef.current?.currentTime || 0,
      duration: 3
    };
    setActiveBrolls([...activeBrolls, newBroll]);
    setShowPexelsPanel(false);
  };

  const searchCaptionBrollVideos = async (query: string) => {
    const keyword = String(query || '').trim();
    if (!keyword) return;
    setIsSearchingCaptionBroll(true);
    try {
      const optionalHeaders = await getOptionalAuthHeaders();
      const token = optionalHeaders.Authorization ? optionalHeaders.Authorization.replace("Bearer ", "") : undefined;
      const results = await searchPexelsVideos(keyword, 12, token);
      setCaptionBrollResults(results);
    } catch (err: any) {
      console.error(err);
      notify(normalizeUserErrorMessage(err, "Không thể tải thư viện B-roll lúc này."), "error");
    } finally {
      setIsSearchingCaptionBroll(false);
    }
  };

  const openCaptionBrollPicker = async (caption: CaptionItem) => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    const keyword = pickBrollKeywordFromCaption(caption);
    setCaptionBrollQuery(keyword);
    setCaptionBrollResults([]);
    setZoomPickerCaptionId(null);
    setTransitionPickerCaptionId(null);
    setBrollPickerCaptionId(caption.id);
    await searchCaptionBrollVideos(keyword);
  };

  const handleAddCaptionBroll = (captionId: string, video: PexelsVideo) => {
    const caption = captions.find((cap) => cap.id === captionId);
    if (!caption) return;
    const bestFile = video.video_files.find((f) => f.quality === 'hd') || video.video_files[0];
    const capStart = Number(caption.start || 0);
    const capEnd = Number(caption.end || (capStart + 1.4));
    const capDuration = Math.max(0.8, capEnd - capStart);
    const clip: BrollClip = {
      id: `${captionId}_${Date.now()}`,
      timestamp: capStart,
      keyword: captionBrollQuery || pickBrollKeywordFromCaption(caption),
      videoUrl: bestFile?.link || video.video_files[0]?.link || '',
      previewUrl: video.image,
      duration: clamp(capDuration, 1.2, 4),
    };
    if (!clip.videoUrl) {
      notify('Không tìm thấy file video phù hợp cho clip này.', 'error');
      return;
    }
    setActiveBrolls((prev) => {
      const next = prev.filter((item) => !(Math.abs(item.timestamp - clip.timestamp) < 0.08 && item.keyword.toLowerCase() === clip.keyword.toLowerCase()));
      return [...next, clip].sort((a, b) => a.timestamp - b.timestamp);
    });
    setBrollPickerCaptionId(null);
    notify('Đã thêm B-roll cho card này.', 'success');
  };

  const handleManualPaymentConfirm = async () => {
    if (!user || !selectedPlanForPayment) return;
    
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/payment-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ plan: selectedPlanForPayment })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Có lỗi xảy ra khi gửi yêu cầu.");
      }
      
      notify("Hệ thống sẽ tự động xác nhận sau khi nhận được tiền. Gói sẽ được kích hoạt khi tiền vào tài khoản.", "success");
      setIsPaymentModalOpen(false);
      refreshQuota();
    } catch (err: any) {
      console.error(err);
      notify(normalizeUserErrorMessage(err, "Có lỗi xảy ra khi gửi yêu cầu."), "error");
    }
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;

      // Prefer popup first (same UX as major web apps), fallback to redirect if blocked.
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      const code = e?.code || 'unknown';
      console.error('Login error', e);

      if (
        code === 'auth/popup-blocked'
        || code === 'auth/operation-not-supported-in-this-environment'
        || (typeof window !== 'undefined' && window.self !== window.top)
      ) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr: any) {
          console.error('Redirect login error', redirectErr);
        }
      }

      if (code === 'auth/unauthorized-domain') {
        notify('Domain hiện tại chưa được phép đăng nhập Google. Thêm domain trong Firebase Console.', "error");
      } else if (code === 'auth/popup-closed-by-user') {
        notify('Bạn đã đóng cửa sổ đăng nhập trước khi hoàn tất.', "info");
      } else if (code === 'auth/cancelled-popup-request') {
        notify('Có một cửa sổ đăng nhập khác đang mở. Hãy hoàn tất hoặc đóng popup đó rồi thử lại.', "info");
      } else {
        notify("Đăng nhập Google chưa thành công. Vui lòng thử lại.", "error");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setAppState('DASHBOARD');
    } catch (e) {
      console.error('Logout error', e);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!user) return;
    if (!window.confirm('Are you sure you want to delete this project?')) return;

    try {
      await deleteDoc(doc(db, 'projects', projectId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `projects/${projectId}`);
    }
  };

  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [isVolumeVisible, setIsVolumeVisible] = useState(false);
  
  // Caption Customization State
  const [captionSettings, setCaptionSettings] = useState({ ...IMAN2_PRESET });
  const [selectedTransition, setSelectedTransition] = useState<TransitionType>('GLARE_SWEEP');
  const [isAiCaptionsEnabled, setIsAiCaptionsEnabled] = useState(false);
  const [customTextOverlays, setCustomTextOverlays] = useState<CustomTextOverlay[]>([]);
  const [selectedCustomTextId, setSelectedCustomTextId] = useState<string | null>(null);
  const [videoAdjustments, setVideoAdjustments] = useState<VideoAdjustments>({ ...DEFAULT_VIDEO_ADJUSTMENTS });

  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isProcessingMagicCut, setIsProcessingMagicCut] = useState(false);
  const [isMagicCutEnabled, setIsMagicCutEnabled] = useState(false);

  // New mock states for Pro tools
  const [isCleanAudioEnabled, setIsCleanAudioEnabled] = useState(false);
  const [isProcessingCleanAudio, setIsProcessingCleanAudio] = useState(false);

  // Viewport toggles
  const [videoFit, setVideoFit] = useState<'cover' | 'contain'>('cover');
  const [isPreviewOnly, setIsPreviewOnly] = useState(false);

  const [isSnapStyleEnabled, setIsSnapStyleEnabled] = useState(false);
  const [isSnapOverlayEnabled, setIsSnapOverlayEnabled] = useState(false);
  const [snapPaceMode, setSnapPaceMode] = useState<SnapPaceMode>('normal');
  const [isAIHookTitleEnabled, setIsAIHookTitleEnabled] = useState(false);
  const [isProcessingHookTitle, setIsProcessingHookTitle] = useState(false);
  const [isProcessingSnap, setIsProcessingSnap] = useState(false);
  const [silenceSegments, setSilenceSegments] = useState<SilenceSegment[]>([]);
  const [transcriptWords, setTranscriptWords] = useState<WordTiming[]>([]);
  const isMagicCutEnabledRef = useRef(false);
  const silenceSegmentsRef = useRef<SilenceSegment[]>([]);
  const lastSilenceJumpRef = useRef<number>(-1);
  const silenceCursorRef = useRef<number>(0);
  const lastSilenceJumpAtMsRef = useRef<number>(0);
  const SILENCE_JUMP_COOLDOWN_MS = 140;
  useEffect(() => {
     isMagicCutEnabledRef.current = isMagicCutEnabled;
  }, [isMagicCutEnabled]);
  useEffect(() => {
    silenceSegmentsRef.current = silenceSegments;
    silenceCursorRef.current = 0;
  }, [silenceSegments]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const configVideoRef = useRef<HTMLVideoElement>(null);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const textInlineInputRef = useRef<HTMLInputElement>(null);
  const suppressOverlayClickRef = useRef(false);
  const textDragStateRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    frameId: number | null;
    pendingX: number;
    pendingY: number;
    moved: boolean;
    startTime: number;
  } | null>(null);
  const textResizeStateRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startFontSize: number;
    frameId: number | null;
    pendingFontSize: number;
    moved: boolean;
  } | null>(null);
  const [snapGuideState, setSnapGuideState] = useState({ x: false, y: false });
  const [editingCustomTextId, setEditingCustomTextId] = useState<string | null>(null);
  const [editingCustomTextValue, setEditingCustomTextValue] = useState('');
  const [customTextHistory, setCustomTextHistory] = useState<Array<{ overlays: CustomTextOverlay[]; selectedId: string | null }>>([]);
  const [customTextFuture, setCustomTextFuture] = useState<Array<{ overlays: CustomTextOverlay[]; selectedId: string | null }>>([]);
  const [copiedCustomTextStyle, setCopiedCustomTextStyle] = useState<Partial<CustomTextOverlay> | null>(null);
  const [isPasteStyleArmed, setIsPasteStyleArmed] = useState(false);
  const snapOverlayCacheRef = useRef<Record<string, CustomTextOverlay[]>>({});
  const snapTranscriptSignatureRef = useRef<string>('');
  const selectedCustomTextIdRef = useRef<string | null>(null);
  const customTextOverlaysRef = useRef<CustomTextOverlay[]>([]);
  const copiedCustomTextStyleRef = useRef<Partial<CustomTextOverlay> | null>(null);

  useEffect(() => {
    selectedCustomTextIdRef.current = selectedCustomTextId;
  }, [selectedCustomTextId]);

  useEffect(() => {
    customTextOverlaysRef.current = customTextOverlays;
  }, [customTextOverlays]);

  useEffect(() => {
    copiedCustomTextStyleRef.current = copiedCustomTextStyle;
  }, [copiedCustomTextStyle]);

  useEffect(() => {
    const signature = buildTranscriptSignature(captions, transcriptWords, Number(duration || 0));
    if (signature !== snapTranscriptSignatureRef.current) {
      snapTranscriptSignatureRef.current = signature;
      snapOverlayCacheRef.current = {};
    }
  }, [captions, transcriptWords, duration]);

  // Get current active caption based on video time
  const activeCaption = captions.find(c => {
     const start = c.start || 0;
     const end = c.end || 0;
     return currentTime >= start && currentTime < end;
  });
  const activeCustomTexts = customTextOverlays.filter((item) => {
    if (!(currentTime >= item.start && currentTime < item.end)) return false;
    if (!isSnapStyleEnabled) return true;
    return item.id.startsWith('snap_pod_');
  });
  const selectedCustomText = customTextOverlays.find((item) => item.id === selectedCustomTextId) || null;
  const previewCustomTexts = activeCustomTexts.length > 0
    ? activeCustomTexts
    : ((activeTab === 'STYLE' || activeTab === 'TEXT_TRANSFORM') && selectedCustomText ? [selectedCustomText] : []);
  const previewVideoFilter = toCssFilter(videoAdjustments);
  const isTextTransformTab = activeTab === 'TEXT_TRANSFORM';

  const snapshotCustomTexts = () => ({
    overlays: customTextOverlays.map((o) => ({ ...o })),
    selectedId: selectedCustomTextId,
  });

  const commitCustomTextHistory = () => {
    const snapshot = snapshotCustomTexts();
    setCustomTextHistory((prev) => [...prev.slice(-79), snapshot]);
    setCustomTextFuture([]);
  };

  const addCustomTextOverlay = () => {
    commitCustomTextHistory();
    const rawCurrentTime = Number(videoRef.current?.currentTime || currentTime || 0);
    const safeDuration = Number(duration || videoRef.current?.duration || 120);
    const start = clamp(rawCurrentTime, 0, Math.max(0, safeDuration - 1.2));
    const end = safeDuration > start
      ? Math.min(safeDuration, Math.max(start + 0.8, start + 3))
      : start + 3;

    const next: CustomTextOverlay = {
      id: `${Date.now()}`,
      text: "Tiêu đề mới",
      start,
      end,
      positionX: 50,
      positionY: 20,
      fontSize: 56,
      color: "#FFFFFF",
      fontWeight: "900",
      fontFamily: "Montserrat",
      strokeWidth: 0,
      strokeColor: "#000000",
      shadowBlur: 6,
      shadowColor: "#000000",
      uppercase: false,
      characterSpacing: 0,
      fontSpacing: 105,
      animationPreset: 'none',
      entryDelayMs: 0,
      entryDurationMs: 220,
      translateYFromPx: 0,
      scaleFrom: 1,
      horizontalAnchor: 'center',
    };
    setCustomTextOverlays((prev) => [...prev, next]);
    setSelectedCustomTextId(next.id);
  };

  const updateCustomTextOverlay = (id: string, patch: Partial<CustomTextOverlay>, options?: { recordHistory?: boolean }) => {
    if (options?.recordHistory !== false) {
      commitCustomTextHistory();
    }
    setCustomTextOverlays((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const removeCustomTextOverlay = (id: string) => {
    commitCustomTextHistory();
    setCustomTextOverlays((prev) => prev.filter((item) => item.id !== id));
    setSelectedCustomTextId((prev) => (prev === id ? null : prev));
  };

  const undoLastCustomTextAction = () => {
    setCustomTextHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const currentSnapshot = snapshotCustomTexts();
      setCustomTextFuture((future) => [...future.slice(-79), currentSnapshot]);
      setCustomTextOverlays(last.overlays.map((o) => ({ ...o })));
      setSelectedCustomTextId(last.selectedId);
      setEditingCustomTextId(null);
      setIsPasteStyleArmed(false);
      return prev.slice(0, -1);
    });
  };

  const redoLastCustomTextAction = () => {
    setCustomTextFuture((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      const currentSnapshot = snapshotCustomTexts();
      setCustomTextHistory((history) => [...history.slice(-79), currentSnapshot]);
      setCustomTextOverlays(next.overlays.map((o) => ({ ...o })));
      setSelectedCustomTextId(next.selectedId);
      setEditingCustomTextId(null);
      setIsPasteStyleArmed(false);
      return prev.slice(0, -1);
    });
  };

  const copyCustomTextStyle = (source: CustomTextOverlay) => {
    const styleOnly: Partial<CustomTextOverlay> = {
      positionX: source.positionX,
      positionY: source.positionY,
      fontSize: source.fontSize,
      color: source.color,
      fontWeight: source.fontWeight,
      fontFamily: source.fontFamily,
      strokeWidth: source.strokeWidth,
      strokeColor: source.strokeColor,
      shadowBlur: source.shadowBlur,
      shadowColor: source.shadowColor,
      uppercase: source.uppercase,
      characterSpacing: source.characterSpacing,
      fontSpacing: source.fontSpacing,
      animationPreset: source.animationPreset,
      entryDelayMs: source.entryDelayMs,
      entryDurationMs: source.entryDurationMs,
      fadeOutDurationMs: source.fadeOutDurationMs,
      translateYFromPx: source.translateYFromPx,
      scaleFrom: source.scaleFrom,
      horizontalAnchor: source.horizontalAnchor,
    };
    copiedCustomTextStyleRef.current = styleOnly;
    setCopiedCustomTextStyle(styleOnly);
    setIsPasteStyleArmed(false);
    notify('Đã copy thuộc tính.', 'success');
  };

  const pasteCustomTextStyleTo = (targetId: string) => {
    const style = copiedCustomTextStyleRef.current;
    if (!style) return;
    commitCustomTextHistory();
    setCustomTextOverlays((prev) =>
      prev.map((item) => (item.id === targetId ? { ...item, ...style } : item))
    );
    setSelectedCustomTextId(targetId);
    setIsPasteStyleArmed(false);
    notify('Đã dán thuộc tính.', 'success');
  };

  const stopTextDragging = () => {
    const state = textDragStateRef.current;
    if (!state) return;
    if (state.frameId) window.cancelAnimationFrame(state.frameId);
    window.removeEventListener('pointermove', handleTextDragMove);
    window.removeEventListener('pointerup', stopTextDragging);
    window.removeEventListener('pointercancel', stopTextDragging);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    if (!state.moved) {
      setSelectedCustomTextId(state.id);
    }
    if (state.moved) {
      suppressOverlayClickRef.current = true;
      window.setTimeout(() => {
        suppressOverlayClickRef.current = false;
      }, 0);
    }
    setSnapGuideState({ x: false, y: false });
    textDragStateRef.current = null;
  };

  const stopTextResizing = () => {
    const state = textResizeStateRef.current;
    if (!state) return;
    if (state.frameId) window.cancelAnimationFrame(state.frameId);
    window.removeEventListener('pointermove', handleTextResizeMove);
    window.removeEventListener('pointerup', stopTextResizing);
    window.removeEventListener('pointercancel', stopTextResizing);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    if (state.moved) {
      suppressOverlayClickRef.current = true;
      window.setTimeout(() => {
        suppressOverlayClickRef.current = false;
      }, 0);
    }
    textResizeStateRef.current = null;
  };

  const applyDragPosition = (clientX: number, clientY: number) => {
    const state = textDragStateRef.current;
    const stage = previewStageRef.current;
    if (!state || !stage) return;
    const rect = stage.getBoundingClientRect();
    let localX = clientX - rect.left - state.offsetX;
    let localY = clientY - rect.top - state.offsetY;
    const centerX = rect.width * 0.5;
    const centerY = rect.height * 0.5;
    const SNAP_THRESHOLD_PX = 12;
    const nearCenterX = Math.abs(localX - centerX) <= SNAP_THRESHOLD_PX;
    const nearCenterY = Math.abs(localY - centerY) <= SNAP_THRESHOLD_PX;
    if (nearCenterX) localX = centerX;
    if (nearCenterY) localY = centerY;
    const nextX = clamp((localX / Math.max(1, rect.width)) * 100, 2, 98);
    const nextY = clamp((localY / Math.max(1, rect.height)) * 100, 2, 98);
    if (!state.moved && (Math.abs(nextX - state.pendingX) > 0.05 || Math.abs(nextY - state.pendingY) > 0.05)) {
      state.moved = true;
    }
    state.pendingX = nextX;
    state.pendingY = nextY;
    setSnapGuideState((prev) => (prev.x === nearCenterX && prev.y === nearCenterY ? prev : { x: nearCenterX, y: nearCenterY }));
    if (state.frameId) return;
    state.frameId = window.requestAnimationFrame(() => {
      const latest = textDragStateRef.current;
      if (!latest) return;
      updateCustomTextOverlay(latest.id, { positionX: latest.pendingX, positionY: latest.pendingY }, { recordHistory: false });
      latest.frameId = null;
    });
  };

  const handleTextDragMove = (event: PointerEvent) => {
    applyDragPosition(event.clientX, event.clientY);
  };

  const applyResizeFontSize = (clientX: number, clientY: number) => {
    const state = textResizeStateRef.current;
    if (!state) return;
    const overlay = customTextOverlays.find((item) => item.id === state.id);
    if (!overlay) return;
    const dx = clientX - state.startClientX;
    const dy = clientY - state.startClientY;
    const delta = (dx + dy) * 0.22;
    const nextFontSize = clamp(Math.round(state.startFontSize + delta), 18, 220);
    if (!state.moved && Math.abs(nextFontSize - state.startFontSize) >= 1) {
      state.moved = true;
    }
    state.pendingFontSize = nextFontSize;
    if (state.frameId) return;
    state.frameId = window.requestAnimationFrame(() => {
      const latest = textResizeStateRef.current;
      if (!latest) return;
      updateCustomTextOverlay(latest.id, { fontSize: latest.pendingFontSize }, { recordHistory: false });
      latest.frameId = null;
    });
  };

  const handleTextResizeMove = (event: PointerEvent) => {
    applyResizeFontSize(event.clientX, event.clientY);
  };

  const beginTextDrag = (event: ReactPointerEvent<HTMLDivElement>, item: CustomTextOverlay) => {
    if (!isTextTransformTab) return;
    if (textResizeStateRef.current) return;
    commitCustomTextHistory();
    const stage = previewStageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const anchorX = rect.left + (item.positionX / 100) * rect.width;
    const anchorY = rect.top + (item.positionY / 100) * rect.height;
    textDragStateRef.current = {
      id: item.id,
      offsetX: event.clientX - anchorX,
      offsetY: event.clientY - anchorY,
      frameId: null,
      pendingX: item.positionX,
      pendingY: item.positionY,
      moved: false,
      startTime: Number(item.start || 0),
    };
    setSelectedCustomTextId(item.id);
    if (activeTab !== 'TEXT_TRANSFORM') setActiveTab('TEXT_TRANSFORM');
    window.addEventListener('pointermove', handleTextDragMove);
    window.addEventListener('pointerup', stopTextDragging);
    window.addEventListener('pointercancel', stopTextDragging);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  };

  const beginTextResize = (event: ReactPointerEvent<HTMLButtonElement>, item: CustomTextOverlay) => {
    if (!isTextTransformTab) return;
    commitCustomTextHistory();
    event.preventDefault();
    event.stopPropagation();
    stopTextDragging();
    textResizeStateRef.current = {
      id: item.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFontSize: Number(item.fontSize || 56),
      frameId: null,
      pendingFontSize: Number(item.fontSize || 56),
      moved: false,
    };
    setSelectedCustomTextId(item.id);
    if (activeTab !== 'TEXT_TRANSFORM') setActiveTab('TEXT_TRANSFORM');
    window.addEventListener('pointermove', handleTextResizeMove);
    window.addEventListener('pointerup', stopTextResizing);
    window.addEventListener('pointercancel', stopTextResizing);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
  };
  useEffect(() => {
    return () => {
      stopTextDragging();
      stopTextResizing();
    };
  }, []);
  useEffect(() => {
    if (activeTab !== 'TEXT_TRANSFORM') {
      stopTextDragging();
      stopTextResizing();
      setSnapGuideState({ x: false, y: false });
      setEditingCustomTextId(null);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!editingCustomTextId) return;
    window.requestAnimationFrame(() => {
      textInlineInputRef.current?.focus();
      textInlineInputRef.current?.select();
    });
  }, [editingCustomTextId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
      if (isTypingTarget) return;
      const isSpace = event.key === ' ';
      if (isSpace && appState === 'EDITOR') {
        event.preventDefault();
        handlePlayPause();
        return;
      }
      const isMeta = event.metaKey || event.ctrlKey;
      if (!isMeta) return;
      const key = event.key.toLowerCase();
      const isUndo = !event.shiftKey && key === 'z';
      const isRedo = event.shiftKey && key === 'z';
      const isCopyStyle = !event.shiftKey && key === 'c';
      const isPasteStyle = event.shiftKey && key === 'v';

      if (isUndo) {
        event.preventDefault();
        if (chatEditHistory.length > 0) {
          undoLastChatEditAction();
        } else {
          undoLastCustomTextAction();
        }
        return;
      }
      if (isRedo) {
        event.preventDefault();
        if (chatEditFuture.length > 0) {
          redoLastChatEditAction();
        } else {
          redoLastCustomTextAction();
        }
        return;
      }
      if (isCopyStyle) {
        event.preventDefault();
        const selectedId = selectedCustomTextIdRef.current;
        const selected = selectedId
          ? customTextOverlaysRef.current.find((item) => item.id === selectedId) || null
          : null;
        if (!selected) {
          notify('Hãy chọn 1 card text trước khi copy thuộc tính.', 'info');
          return;
        }
        copyCustomTextStyle(selected);
        return;
      }
      if (isPasteStyle) {
        event.preventDefault();
        if (!copiedCustomTextStyleRef.current) {
          notify('Chưa có thuộc tính để dán.', 'info');
          return;
        }
        setIsPasteStyleArmed(true);
        notify('Đã bật dán thuộc tính. Chọn card đích để dán.', 'info');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [appState, selectedCustomText, copiedCustomTextStyle, customTextOverlays, selectedCustomTextId, isPlaying, chatEditHistory, chatEditFuture]);

  const buildSnapPodPresetOverlays = (
    sourceCaptions: CaptionItem[],
    totalDurationSec: number,
    sourceWords: WordTiming[] = [],
    paceMode: SnapPaceMode = snapPaceMode
  ): CustomTextOverlay[] => {
    const wordsTimeline = buildSnapWordUnits(sourceWords, totalDurationSec);
    const captionTimeline = (wordsTimeline.length > 0
      ? wordsTimeline.map((unit) => ({
          start: unit.start,
          end: unit.end,
          text: unit.text,
          words: unit.words,
        }))
      : sourceCaptions
          .map((cap) => ({
            start: Math.max(0, Number(cap.start || 0)),
            end: Math.max(0, Number(cap.end || 0)),
            text: String(cap.text || '').trim(),
            words: String(cap.text || '').trim().split(/\s+/).filter(Boolean),
          }))
          .filter((cap) => cap.end > cap.start && cap.text.length > 0)
          .sort((a, b) => a.start - b.start));

    if (captionTimeline.length === 0) {
      return [];
    }

    const overlays: CustomTextOverlay[] = [];
    const baseFontSize = 15;
    const maxClipEnd = Math.max(0.8, totalDurationSec || captionTimeline[captionTimeline.length - 1].end + 0.4);

    const makeLayer = (
      id: string,
      text: string,
      start: number,
      end: number,
      delayMs: number,
      positionX: number,
      positionY: number,
      scale: number,
      fontWeight: string,
      horizontalAnchor: CustomTextOverlay['horizontalAnchor'],
      characterSpacing = -2,
      fontSpacing = 100
    ): CustomTextOverlay => ({
      id,
      text,
      start,
      end,
      positionX,
      positionY,
      fontSize: Math.round(baseFontSize * scale),
      color: '#FFFFFF',
      fontWeight,
      fontFamily: 'SF Pro Display',
      strokeWidth: 0,
      strokeColor: '#000000',
      shadowBlur: 0,
      shadowColor: '#000000',
      uppercase: false,
      characterSpacing,
      fontSpacing,
      animationPreset: 'subtle_in',
      entryDelayMs: delayMs,
      entryDurationMs: 220,
      translateYFromPx: 12,
      scaleFrom: 0.98,
      horizontalAnchor,
    });

    const pace = SNAP_PACE_CONFIG[paceMode];
    const snapLayout = {
      l1: { y: 69.8, scale: 1.38, weight: '500', anim: 'slide_down' as const, anchor: 'left' as const, spacing: 100 },
      l2: { x: 50, y: 78.6, scale: 2.95, weight: '700', anim: 'slide_up' as const, anchor: 'center' as const, spacing: 100 },
      l3: { y: 86.8, scale: 1.38, weight: '500', anim: 'slide_up' as const, anchor: 'left' as const, spacing: 80 },
    };

    for (let i = 0; i < captionTimeline.length; i++) {
      const cap = captionTimeline[i];
      const startSec = Math.max(0, cap.start);
      const endSec = Math.min(maxClipEnd, Math.max(startSec + 0.4, cap.end));
      const [layer1Text, layer2Text, layer3Text] = splitWordsIntoLayersFromTokens(cap.words || []);
      const layerPool = [layer1Text, layer2Text, layer3Text].filter(Boolean);
      const availableLayers = layerPool.length;
      const totalWords = (cap.words || []).length;
      const desiredLayers = totalWords <= 4 ? 2 : 3;
      const finalTexts = layerPool.slice(0, Math.max(1, Math.min(desiredLayers, availableLayers)));
      const [finalL1, finalL2, finalL3] = [finalTexts[0] || '', finalTexts[1] || '', finalTexts[2] || ''];
      const visibleLayers = Math.max(1, finalTexts.length);
      const totalWindow = Math.max(0.4, endSec - startSec);
      const entryWindow = Math.max(0.2, totalWindow * pace.entryRatio);
      const perLayerEntry = entryWindow / visibleLayers;
      const fadeOutMs = Math.max(120, Math.min(300, Math.round(totalWindow * pace.exitRatio * 1000)));
      const targetAnimMs = 700;
      const fittedAnimMs = Math.min(targetAnimMs, Math.max(260, Math.round((totalWindow * 1000) / (visibleLayers + 0.55))));
      const baseVideoWidth = Math.max(320, Number(videoRef.current?.videoWidth || 1080));
      const l2FontSize = Math.round(baseFontSize * snapLayout.l2.scale);
      const l2WidthPx = estimateTextWidthPx(finalL2 || '', l2FontSize, snapLayout.l2.weight, -1);
      const l2WidthPercent = (l2WidthPx / baseVideoWidth) * 100;
      const l2Left = clamp(snapLayout.l2.x - (l2WidthPercent / 2), 6, 92);
      const l2Right = clamp(snapLayout.l2.x + (l2WidthPercent / 2), 8, 94);
      const l1X = l2Left;
      const l3X = l2Right;

      if (finalL1) {
        const l1Start = startSec;
        overlays.push({
          ...makeLayer(`snap_pod_${i}_l1`, finalL1, l1Start, endSec, 0, l1X, snapLayout.l1.y, snapLayout.l1.scale, snapLayout.l1.weight, snapLayout.l1.anchor, -2, snapLayout.l1.spacing),
          animationPreset: snapLayout.l1.anim,
          entryDurationMs: fittedAnimMs,
          fadeOutDurationMs: fadeOutMs,
        });
      }
      if (finalL2) {
        const l2Start = startSec + (perLayerEntry * 0.92);
        overlays.push({
          ...makeLayer(`snap_pod_${i}_l2`, finalL2, l2Start, endSec, 0, snapLayout.l2.x, snapLayout.l2.y, snapLayout.l2.scale, snapLayout.l2.weight, snapLayout.l2.anchor, -2, snapLayout.l2.spacing),
          animationPreset: snapLayout.l2.anim,
          entryDurationMs: fittedAnimMs,
          fadeOutDurationMs: fadeOutMs,
        });
      }
      if (finalL3) {
        const l3Start = startSec + (perLayerEntry * 1.84);
        overlays.push({
          ...makeLayer(`snap_pod_${i}_l3`, finalL3, l3Start, endSec, 0, l3X, snapLayout.l3.y, snapLayout.l3.scale, snapLayout.l3.weight, snapLayout.l3.anchor, -2, snapLayout.l3.spacing),
          animationPreset: snapLayout.l3.anim,
          entryDurationMs: fittedAnimMs,
          fadeOutDurationMs: fadeOutMs,
        });
      }
    }

    return overlays;
  };

  const getCachedSnapPodOverlays = (paceMode: SnapPaceMode) => {
    const transcriptSignature = buildTranscriptSignature(captions, transcriptWords, Number(duration || 0));
    const cacheKey = `snap:${SNAP_SEGMENTATION_VERSION}:${paceMode}:${transcriptSignature}`;
    const cached = snapOverlayCacheRef.current[cacheKey];
    if (cached && cached.length > 0) {
      return cloneCustomTextOverlays(cached);
    }
    const generated = buildSnapPodPresetOverlays(captions, Number(duration || 0), transcriptWords, paceMode);
    snapOverlayCacheRef.current[cacheKey] = cloneCustomTextOverlays(generated);
    return cloneCustomTextOverlays(generated);
  };

  const handleCaptionStyleSelect = async (styleId: string) => {
    if (isSnapStyleEnabled) {
      setIsSnapStyleEnabled(false);
      notify(`Đã tắt ${BRAND.styleFeatureName} để bạn chọn style caption thường.`, 'info');
    }
    if (!isAiCaptionsEnabled) {
      setIsAiCaptionsEnabled(true);
    }
    setSelectedStyle(styleId);
    if (styleId === 'iman2') {
      setCaptionSettings(prev => ({ ...prev, ...IMAN2_PRESET }));
    }
  };

  const handleMagicCut = async () => {
    if (isMagicCutEnabled) {
      setIsMagicCutEnabled(false);
      setSilenceSegments([]);
      setJobStatus('');
      return;
    }
    
    setIsProcessingMagicCut(true);
    setJobStatus('Analyzing silences...');

    try {
      const response = await analyzeSilencePreview(
        { captions, words: transcriptWords, duration: Number(duration || 0) },
        await getAuthHeaders(),
      );
      const segments = Array.isArray(response.silenceSegments)
        ? response.silenceSegments
            .map((segment) => ({
              start: clamp(Number(segment.start || 0), 0, Number(duration || 0)),
              end: clamp(Number(segment.end || 0), 0, Number(duration || 0)),
            }))
            .filter((segment) => segment.end - segment.start >= 0.08)
            .sort((a, b) => a.start - b.start)
        : [];
      setSilenceSegments(segments);
      setIsMagicCutEnabled(segments.length > 0);
      if (segments.length === 0) {
        notify('Không phát hiện khoảng lặng đủ dài để cắt.', 'info');
      } else {
        const totalCut = segments.reduce((acc, segment) => acc + (segment.end - segment.start), 0);
        const ratio = duration > 0 ? Math.round((totalCut / duration) * 100) : 0;
        notify(`Đã tối ưu nhịp nói, cắt khoảng ${ratio}% thời lượng im lặng.`, 'success');
      }
    } catch (error) {
      console.warn('Server silence detection failed, using local fallback:', error);
      const fallbackSegments = detectSilenceSegmentsLocal(captions, Number(duration || 0));
      setSilenceSegments(fallbackSegments);
      setIsMagicCutEnabled(fallbackSegments.length > 0);
      if (fallbackSegments.length === 0) {
        notify('Không phát hiện khoảng lặng đủ dài để cắt.', 'info');
      } else {
        notify('Dùng local fallback để phân tích khoảng lặng.', 'info');
      }
    } finally {
      setIsProcessingMagicCut(false);
      setJobStatus('');
    }
  };

  const handleSnapEdit = () => {
    if (isSnapStyleEnabled) {
      setIsSnapStyleEnabled(false);
      setIsSnapOverlayEnabled(false);
      setCustomTextOverlays((prev) => prev.filter((item) => !item.id.startsWith('snap_pod_')));
      return;
    }

    setIsProcessingSnap(true);
    setJobStatus(`Applying ${BRAND.styleFeatureName}...`);

    const snapOverlays = getCachedSnapPodOverlays(snapPaceMode);
    setSelectedStyle('alex');
    setIsAiCaptionsEnabled(false);
    setActiveBrolls([]);
    setActiveZooms([]);
    setCustomTextOverlays((prev) => {
      const nonSnap = prev.filter((item) => !item.id.startsWith('snap_pod_'));
      return [...nonSnap, ...snapOverlays];
    });
    setSelectedCustomTextId(snapOverlays[1]?.id || snapOverlays[0]?.id || null);
    setIsSnapOverlayEnabled(true);
    setIsProcessingSnap(false);
    setIsSnapStyleEnabled(true);
    setJobStatus('');
      notify(`${BRAND.styleFeatureName} đã áp dụng theo timestamp Whisper.`, 'success');
  };

  const handleCleanAudio = () => {
    if (isCleanAudioEnabled) {
      setIsCleanAudioEnabled(false);
      notify('Đã tắt Clean Audio cho lần export tiếp theo.', 'info');
      return;
    }
    setIsProcessingCleanAudio(true);
    setTimeout(() => {
      setIsProcessingCleanAudio(false);
      setIsCleanAudioEnabled(true);
      notify('Clean Audio sẽ áp dụng khi export (khử noise + EQ nhẹ).', 'success');
    }, 600);
  };

  useEffect(() => {
    if (!isSnapStyleEnabled) return;
    const snapOverlays = getCachedSnapPodOverlays(snapPaceMode);
    setCustomTextOverlays((prev) => {
      const nonSnap = prev.filter((item) => !item.id.startsWith('snap_pod_'));
      return [...nonSnap, ...snapOverlays];
    });
    setSelectedCustomTextId((prev) => prev && prev.startsWith('snap_pod_') ? prev : (snapOverlays[1]?.id || snapOverlays[0]?.id || null));
  }, [snapPaceMode, isSnapStyleEnabled, captions, transcriptWords, duration]);

  const handleHookTitle = () => {
    if (isAIHookTitleEnabled) {
      setIsAIHookTitleEnabled(false);
      return;
    }
    setIsProcessingHookTitle(true);
    setTimeout(() => {
      setIsProcessingHookTitle(false);
      setIsAIHookTitleEnabled(true);
    }, 1500);
  };

  const handleExport = async () => {
    if (!videoFile && !videoUrl) return;
    setIsExporting(true);
    setExportProgress(0);
    setExportProgressTarget(0);
    setJobStatus('Đang chuẩn bị file cho xuất video...');

    try {
      let exportUrl = videoUrl;
      let uploadedFilePath: string | null = null;
      
      // If the current videoUrl is a local blob, we might need to upload it first
      // But usually, if they used generateCaptions, we might already have a storage URL
      // Let's assume we want to ensure it's in storage if it's a big export
      if (videoUrl?.startsWith('blob:') && videoFile) {
         setJobStatus('Đang chuẩn bị file cho xuất video...');
         setExportProgressTarget((prev) => Math.max(prev, 6));
         const uploaded = await uploadRawVideoForExport(videoFile, await getAuthHeaders(), (percent) => {
           setJobStatus(`Đang chuẩn bị file cho xuất video... (${percent}%)`);
           const mapped = 6 + Math.round((Math.max(0, Math.min(100, percent)) / 100) * 16);
           setExportProgressTarget((prev) => Math.max(prev, mapped));
         });
         uploadedFilePath = uploaded.uploadedFilePath;
         exportUrl = null;
         setExportProgressTarget((prev) => Math.max(prev, 22));
      }

      setJobStatus('Đang tạo job xuất video...');
      setExportProgressTarget((prev) => Math.max(prev, 24));
      const authHeaders = await getAuthHeaders();
      const normalizedExportState = {
        captions: isAiCaptionsEnabled ? captions : [],
        brolls: activeBrolls,
        zooms: activeZooms,
        style: selectedStyle,
        captionSettings,
        isSnapMode: isSnapStyleEnabled,
        isMagicCutEnabled,
        silenceSegments,
        words: transcriptWords,
        transitionType: selectedTransition,
        customTextOverlays: isSnapStyleEnabled
          ? customTextOverlays.filter((item) => item.id.startsWith('snap_pod_'))
          : customTextOverlays,
        videoAdjustments,
        cleanAudioEnabled: isCleanAudioEnabled,
        brandKit,
      };
      const { jobId } = await createExportJob({
        videoUrl: exportUrl,
        uploadedFilePath,
        ...normalizedExportState,
      }, authHeaders);
      setCurrentJobId(jobId);
      setQueuePosition(null);
      
      let isDone = false;
      while (!isDone) {
         await new Promise((r) => setTimeout(r, 2000));
         const job = await getJobStatus(jobId, authHeaders);
         setJobStatus(job.status || '');
         setQueuePosition(typeof job.queuePosition === 'number' ? job.queuePosition : null);
         setExportProgressTarget((prev) =>
           Math.max(prev, mapExportProgressTarget(job.status || '', job.progress || 0, job.queuePosition))
         );

         if (job.status === "error") {
             throw new Error(job.error || "Máy chủ báo lỗi xuất video thất bại.");
         }
         
         if (job.status === "done") {
             isDone = true;
             setExportProgressTarget(100);
             if (job.result && job.result.downloadUrl) {
                setLastExportUrl(job.result.downloadUrl);
                window.location.href = job.result.downloadUrl;
                if (plan === 'PRO' || plan === 'BASIC') {
                  setTimeout(() => setIsTikTokPublishOpen(true), 800);
                }
             }
         }
      }
    } catch (err: any) {
      console.error(err);
      notify(normalizeUserErrorMessage(err, "Xuất video thất bại. Vui lòng thử lại."), "error");
    } finally {
      setIsExporting(false);
    }
  };

  const generateCaptions = async () => {
    if (!videoFile) return;

    setAppState('PROCESSING');
    setIsProcessing(true);
    setError(null);
    setCurrentJobId(null);
    setQueuePosition(null);
    setProgress(5);
    setProgressTarget(5);

    try {
      // 1. Upload directly to backend job endpoint to avoid Firebase upload stalls in local/dev.
      setJobStatus('Đang tải video lên máy chủ...');
      // 2. Create transcription job
      setJobStatus('Đang khởi tạo tiến trình AI...');
      const authHeaders = await getAuthHeaders();
      const { jobId } = await createTranscriptionJob(
        videoFile,
        language,
        videoFile.name,
        authHeaders,
        (percent) => {
          setJobStatus(`Đang tải video lên máy chủ... (${percent}%)`);
          const uploadTarget = Math.max(8, Math.min(38, Math.round((percent / 100) * 38)));
          setProgressTarget((prev) => Math.max(prev, uploadTarget));
        },
      );

      if (!jobId) throw new Error("Khởi tạo tiến trình nền thất bại.");
      setCurrentJobId(jobId);
      setProgressTarget((prev) => Math.max(prev, 42));

      // Polling Loop for the Job
      let isDone = false;
      let fails = 0;
      while (!isDone) {
         await new Promise(r => setTimeout(r, 2000));
         let job;
         try {
            job = await getJobStatus(jobId, authHeaders);
         } catch {
            fails++;
            if (fails > 3) throw new Error("Mất kết nối với máy chủ.");
            continue;
         }
         fails = 0;
         setJobStatus(job.status || '');
         setQueuePosition(typeof job.queuePosition === 'number' ? job.queuePosition : null);
         setProgressTarget((prev) =>
           Math.max(prev, mapTranscribeProgressTarget(job.status || '', job.progress || 0, job.queuePosition))
         );
         
         if (job.status === "error") {
             throw new Error(job.error || "Máy chủ báo lỗi xử lý thất bại.");
         }
         
         if (job.status === "done") {
             isDone = true;
             setProgressTarget(100);
             if (job.result) {
                  const finalCaptions = Array.isArray(job.result.captions) ? job.result.captions : (Array.isArray(job.result) ? job.result : []);
                  const finalWords = Array.isArray(job.result.words)
                    ? job.result.words
                        .map((w: any) => ({
                          start: Number(w?.start || 0),
                          end: Number(w?.end || 0),
                          word: String(w?.word || ''),
                        }))
                        .filter((w: WordTiming) => w.end > w.start)
                    : [];
                  setCaptions(finalCaptions);
                  setTranscriptWords(finalWords);
                  
                  // Save project to Firestore if logged in
                  if (user) {
                    try {
                      await addDoc(collection(db, 'projects'), {
                        userId: user.uid,
                        name: fileName || 'New Project',
                        thumbnailUrl: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=400',
                        duration: duration || 0,
                        videoUrl: videoUrl || '',
                        createdAt: Date.now(),
                      });
                    } catch (e) {
                      handleFirestoreError(e, OperationType.CREATE, 'projects');
                    }
                  }
                  
                  refreshQuota();
                  setTimeout(() => setAppState('EDITOR'), 800);
             } else {
                 throw new Error("AI không thể tạo phụ đề cho video này (Kết quả trống).");
             }
             break;
         }
         
      }

    } catch (err: any) {
      console.error("Client error:", err);
      setError(normalizeUserErrorMessage(err, "Đã xảy ra lỗi không xác định. Vui lòng thử lại với video khác."));
      setProgress(0);
      setProgressTarget(0);
    } finally {
      setIsProcessing(false);
    }
  };

  const buildCraftBrollPlan = (): BrollSuggestion[] => {
    if (duration <= 0) return [];
    // Single user-facing mode: BASIC (balanced pacing, less crowded than fixed 2.5s).
    const spacing = 5.6;
    const minSpacing = 4.4;
    const maxCoverageRatio = 0.30;
    const maxPerTenSeconds = 2;
    const plan: BrollSuggestion[] = [];
    const maxItems = Math.min(18, Math.floor(duration / spacing));
    let cursor = 0.6;
    let coveredDuration = 0;

    const countInLastTenSeconds = (time: number) =>
      plan.filter((item) => time - item.timestamp <= 10).length;

    for (let i = 0; i < maxItems && cursor < duration - 0.8; i++) {
      const timestamp = Number(cursor.toFixed(2));
      const matchingCaption = captions.find((cap) => timestamp >= cap.start && timestamp <= cap.end)
        || captions.reduce<CaptionItem | null>((best, cap) => {
          const capMid = (cap.start + cap.end) / 2;
          if (!best) return cap;
          const bestMid = (best.start + best.end) / 2;
          return Math.abs(capMid - timestamp) < Math.abs(bestMid - timestamp) ? cap : best;
        }, null);
      const keyword = pickBrollKeywordFromCaption(matchingCaption || undefined);
      const wordNear = transcriptWords.find((w) => timestamp >= w.start && timestamp <= w.end);
      const finalKeyword = wordNear?.word ? String(wordNear.word).replace(/[^\p{L}\p{N}]/gu, '') || keyword : keyword;
      if (countInLastTenSeconds(timestamp) >= maxPerTenSeconds) {
        cursor += spacing;
        continue;
      }
      if (plan.length > 0 && timestamp - plan[plan.length - 1].timestamp < minSpacing) {
        cursor += spacing;
        continue;
      }
      const suggestedDuration = 2.2;
      if ((coveredDuration + suggestedDuration) / duration > maxCoverageRatio) break;
      plan.push({
        id: `craft_${i}`,
        keyword: finalKeyword,
        timestamp,
        duration: suggestedDuration,
        score: 84,
        reason: 'Basic mode: balanced pacing from word-level timing.',
      });
      coveredDuration += suggestedDuration;
      cursor += spacing;
    }
    return plan;
  };

  const handleGenerateBrolls = async (options?: { useCraft?: boolean; autoApply?: boolean }) => {
    if (captions.length === 0) return;
    const useCraft = Boolean(options?.useCraft);
    const autoApply = Boolean(options?.autoApply);
    setIsAnalyzingBrolls(true);
    try {
      let validBrolls: BrollSuggestion[] = [];
      if (useCraft) {
        validBrolls = buildCraftBrollPlan();
      } else {
        const data = await analyzeBrolls(captions, await getAuthHeaders());
        if (Array.isArray(data.brolls)) {
          validBrolls = data.brolls.filter((b: any) => typeof b.keyword === 'string' && typeof b.timestamp === 'number').map((b: any) => ({
            id: b.id,
            keyword: String(b.keyword).trim(),
            timestamp: Number(b.timestamp),
            duration: Number(b.duration || 3),
            score: Number(b.score || 0),
            reason: String(b.reason || ''),
          }));
        }
      }

      if (validBrolls.length > 0) {
        setBrollSuggestions(validBrolls);
        notify(
          useCraft
            ? `Đã tạo Basic B-roll plan ${validBrolls.length} cảnh (nhịp cân bằng).`
            : `Đã tạo auto B-roll plan ${validBrolls.length} cảnh.`,
          "success"
        );
        if (autoApply) {
          await handleApplyAutoBrollPlan(validBrolls);
        }
      } else {
        notify("AI phân tích không trả về kết quả hợp lệ.", "error");
      }
    } catch (err: any) {
      console.error(err);
      notify(normalizeUserErrorMessage(err, "Không thể phân tích B-roll lúc này."), "error");
    } finally {
      setIsAnalyzingBrolls(false);
    }
  };

  const handleApplyAutoBrollPlan = async (inputSuggestions?: BrollSuggestion[]) => {
    const sourceSuggestions = Array.isArray(inputSuggestions) && inputSuggestions.length > 0
      ? inputSuggestions
      : brollSuggestions;
    if (sourceSuggestions.length === 0 || isApplyingAutoBrollPlan) return;
    setIsApplyingAutoBrollPlan(true);
    try {
      const optionalHeaders = await getOptionalAuthHeaders();
      const token = optionalHeaders.Authorization ? optionalHeaders.Authorization.replace("Bearer ", "") : undefined;
      const newClips: BrollClip[] = [];

      for (const suggestion of sourceSuggestions) {
        const duplicate = activeBrolls.some((clip) =>
          Math.abs(clip.timestamp - suggestion.timestamp) < 2.4
        );
        if (duplicate) continue;
        const results = await searchPexelsVideos(suggestion.keyword, 2, token);
        if (!Array.isArray(results) || results.length === 0) continue;
        const picked = results[0];
        const bestFile = picked.video_files.find((f) => f.quality === 'hd') || picked.video_files[0];
        if (!bestFile?.link) continue;
        newClips.push({
          id: `${picked.id}_${Math.round(suggestion.timestamp * 100)}`,
          timestamp: suggestion.timestamp,
          keyword: suggestion.keyword,
          videoUrl: bestFile.link,
          previewUrl: picked.image,
          duration: Math.max(1.2, Math.min(4, Number(suggestion.duration || 3))),
        });
      }

      if (newClips.length === 0) {
        notify("Không tìm thấy clip phù hợp để auto apply.", "info");
        return;
      }

      setActiveBrolls((prev) => [...prev, ...newClips].sort((a, b) => a.timestamp - b.timestamp));
      notify(`Đã auto add ${newClips.length} B-roll theo nhịp video.`, "success");
    } catch (err: any) {
      console.error(err);
      notify(normalizeUserErrorMessage(err, "Không thể auto add B-roll lúc này."), "error");
    } finally {
      setIsApplyingAutoBrollPlan(false);
    }
  };

  const handleAutoBrollToggle = async () => {
    if (activeBrolls.length > 0 || brollSuggestions.length > 0) {
      setActiveBrolls([]);
      setBrollSuggestions([]);
      notify("Đã tắt AI Auto B-roll.", "info");
      return;
    }
    setActiveTab('CAPTIONS');
    await handleGenerateBrolls({ useCraft: true, autoApply: true });
  };

  const handleGenerateZooms = () => {
    setIsAnalyzingZooms(true);
    // AI analysis based on Submagic analysis provided
    setTimeout(() => {
        const newZooms: ZoomClip[] = [];
        let lastZoomTime = -5; // For spacing logic (preventing too many zooms)
        
        // Emphasized patterns in Vietnamese based on Submagic analysis
        const HIGH_EMPHASIS_KEYWORDS = [
            "KHÔNG BAO GIỜ", "TẤT CẢ", "THẬT SỰ", "QUAN TRỌNG", "HÃY NHỚ", "ĐẶC BIỆT", 
            "ĐIỀU NÀY", "SỰ THẬT", "TUYỆT ĐỐI", "THÀNH CÔNG", "KINH DOANH", "TIỀN", "BÍ MẬT"
        ];
        
        captions.forEach((cap, index) => {
            let score = 0;
            const duration = (cap.end || 0) - (cap.start || 0);
            if (duration <= 0) return;
            
            const words = cap.text.split(" ").length;
            const speechRate = words / duration; 
            
            // 1. Audio Analysis Proxy (Submagic Signal 1)
            if (speechRate > 3.2) score += 25; // Nói nhanh = năng lượng cao
            if (speechRate < 1.3) score += 15; // Nói chậm = nhấn mạnh
            
            // 2. NLP Semantic Scoring (Submagic Signal 2)
            const textUpper = cap.text.toUpperCase();
            const hasKeyword = HIGH_EMPHASIS_KEYWORDS.some(kw => textUpper.includes(kw));
            if (hasKeyword) score += 35;
            
            if (cap.text.endsWith('?') || cap.text.endsWith('!')) score += 20;

            // 3. Spacing Rule (Submagic Signal 3)
            if ((cap.start || 0) - lastZoomTime < 2.0) {
                score -= 60; // Tránh zoom quá dày gây chóng mặt
            }
            
            if (score >= 40) {
                let type: ZoomType = 'ZOOM_FAST';
                if (score > 60) type = 'CRASH_ZOOM';
                else if (duration > 1.8) type = 'SMOOTH_HOLD';
                
                newZooms.push({
                    id: Math.random().toString(36).substring(7),
                    timestamp: cap.start || 0,
                    duration: Math.min(2.0, duration), 
                    type: type
                });
                lastZoomTime = cap.start || 0;
            }
        });
        
        setActiveZooms(newZooms);
        setIsAnalyzingZooms(false);
    }, 1500); 
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isLocalAdminMode = typeof window !== 'undefined' && window.location.hostname === 'localhost';
      // Strategy-based limits:
      // FREE: 1 min / 50MB
      // BASIC: 3 min / 100MB
      // PRO: 3 min / 100MB (but allows much larger files for upload stability)

      const maxSize = isLocalAdminMode
        ? 500 * 1024 * 1024
        : (plan === 'FREE' ? 50 * 1024 * 1024 : 100 * 1024 * 1024);
      
      if (file.size > maxSize) {
        if (isLocalAdminMode) {
          notify(`Video quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Giới hạn kiểm thử local admin là 500MB.`, "error");
        } else {
          notify(plan === 'FREE'
            ? `Video quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Gói Miễn phí giới hạn 50MB. Nâng cấp lên CƠ BẢN (100MB) để tiếp tục.`
            : `Video quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Giới hạn hiện tại là 100MB.`
          , "error");
        }
        e.target.value = "";
        return;
      }
      
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setVideoFile(file);
      setFileName(file.name);
      setAppState('UPLOAD_CONFIG');
    }
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch(console.error);
        setIsPlaying(true);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && !videoRef.current.seeking) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.volume = volume;
    }
  };

  const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    silenceCursorRef.current = 0;
    lastSilenceJumpRef.current = -1;
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
    }
  };

  const toggleAspectRatio = () => {
    setAspectRatio(prev => prev === '9:16' ? '16:9' : '9:16');
  };

  // Sync time continuously using requestAnimationFrame
  const reqRef = useRef<number>();

  const trackTime = () => {
    if (videoRef.current && !videoRef.current.seeking) {
        let current = videoRef.current.currentTime;

        if (isMagicCutEnabledRef.current && silenceSegmentsRef.current.length > 0 && !videoRef.current.paused) {
          const segments = silenceSegmentsRef.current;
          const nowMs = performance.now();
          let cursor = Math.min(Math.max(0, silenceCursorRef.current), segments.length - 1);

          while (cursor < segments.length && current >= segments[cursor].end - 0.001) {
            cursor += 1;
          }
          silenceCursorRef.current = cursor;

          if (cursor < segments.length) {
            const currentSilence = segments[cursor];
            if (current >= currentSilence.start && current < currentSilence.end) {
              // Avoid repeated tight seeks on adjacent frames; jump slightly past the cut end for smoother decode.
              const jumpTarget = Math.min(
                (videoRef.current.duration || Number.POSITIVE_INFINITY) - 0.02,
                Math.max(currentSilence.end + 0.02, currentSilence.start + 0.03),
              );
              const enoughCooldown = nowMs - lastSilenceJumpAtMsRef.current >= SILENCE_JUMP_COOLDOWN_MS;
              if (enoughCooldown && Math.abs(lastSilenceJumpRef.current - jumpTarget) > 0.01) {
                videoRef.current.currentTime = jumpTarget;
                lastSilenceJumpRef.current = jumpTarget;
                lastSilenceJumpAtMsRef.current = nowMs;
                current = jumpTarget;
                silenceCursorRef.current = Math.min(cursor + 1, segments.length - 1);
              }
            }
          }
        }

        setCurrentTime(current);
    }
    reqRef.current = requestAnimationFrame(trackTime);
  };

  useEffect(() => {
    if (isPlaying) {
      reqRef.current = requestAnimationFrame(trackTime);
    } else {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    }
    return () => {
       if (reqRef.current) cancelAnimationFrame(reqRef.current);
    };
  }, [isPlaying]);

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  // Removed mock progress simulation as we now use real AI
  // Simulation: Progress in processing step
  /*
  useEffect(() => {
    ...
  }, [appState]);
  */

  const monthlyQuotaLabel = formatMonthlyVideoQuota(quota, plan);
  const monthlyQuotaPct = monthlyQuotaPercent(quota, plan);

  return (
    <div className="flex h-screen bg-[#F8F9FA] text-[#111] font-sans selection:bg-zinc-900 selection:text-white overflow-hidden">
      
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileSelect} 
        accept="video/*" 
        className="hidden" 
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className={`fixed top-5 right-5 z-[100] max-w-sm rounded-2xl border px-4 py-3 shadow-xl flex items-start gap-3 ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
                : toast.type === 'error'
                  ? 'bg-red-50 border-red-100 text-red-900'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-900'
            }`}
          >
            {toast.type === 'success' ? <Check className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
            <p className="text-sm font-semibold leading-snug">{toast.message}</p>
            <button onClick={() => setToast(null)} className="ml-2 text-current opacity-50 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="lg:hidden fixed top-0 inset-x-0 z-[70] h-14 bg-white/90 backdrop-blur-md border-b border-zinc-100 flex items-center justify-between px-4">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="p-2 rounded-lg text-zinc-600 hover:bg-zinc-100"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <img src={BRAND.logoSrc} alt={BRAND.name} className="h-7 object-contain" />
        <button
          type="button"
          onClick={() => setAppState('UPLOADING')}
          className="text-[11px] font-bold bg-zinc-900 text-white px-3 py-1.5 rounded-full"
        >
          New
        </button>
      </header>

      {mobileNavOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 z-[55] bg-black/40"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <motion.aside 
        animate={{ width: isSidebarCollapsed ? 80 : 250 }}
        className={`border-r border-zinc-100 bg-zinc-50 flex flex-col shrink-0 overflow-hidden fixed lg:relative inset-y-0 left-0 z-[60] transition-transform duration-300 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-20 px-6 flex items-center justify-between shrink-0">
          <div className={`flex items-center gap-2 overflow-hidden transition-all ${isSidebarCollapsed ? 'w-full justify-center' : ''}`}>
            <img 
              src={BRAND.logoSrc} 
              alt={BRAND.name} 
              className={`object-contain ${isSidebarCollapsed ? 'w-10 h-10' : 'w-36 max-w-full'}`} 
              onError={e => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).nextElementSibling!.classList.remove('hidden');
              }} 
            />
            <div className="hidden flex-row items-center gap-2">
              <div className="w-8 h-8 bg-zinc-900 rounded flex items-center justify-center shrink-0">
                <span className="text-white font-black text-sm leading-none">ES</span>
              </div>
              {!isSidebarCollapsed && <span className="text-xl font-bold tracking-tight text-zinc-900 font-montserrat">{BRAND.name}</span>}
            </div>
          </div>
          {!isSidebarCollapsed && (
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1.5 hover:bg-zinc-50 rounded-lg text-zinc-400 hover:text-zinc-900 transition-colors"
            >
              <ChevronDown className="w-4 h-4 rotate-90" />
            </button>
          )}
        </div>

        {isSidebarCollapsed && (
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="flex justify-center mb-6 text-zinc-300 hover:text-zinc-900 transition-colors"
          >
            <ChevronDown className="w-4 h-4 -rotate-90" />
          </button>
        )}

        <div className={`flex-1 px-3 space-y-1 ${isSidebarCollapsed ? 'flex flex-col items-center' : ''} overflow-y-auto`}>
          <div className="mb-4">
            {!isSidebarCollapsed && <p className="px-3 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Main</p>}
            <SidebarItem icon={LayoutGrid} label={isSidebarCollapsed ? "" : "Projects"} active={appState === 'DASHBOARD'} onClick={() => { setAppState('DASHBOARD'); setMobileNavOpen(false); }} />
            <SidebarItem icon={Sparkles} label={isSidebarCollapsed ? "" : "AI Lab"} active={appState === 'AI_STUDIO'} badge={isSidebarCollapsed ? null : "Hot"} onClick={() => { setAppState('AI_STUDIO'); setMobileNavOpen(false); }} />
          </div>
          
          <div className="pt-4 border-t border-zinc-50">
            <button 
              onClick={() => { setAppState('UPLOADING'); setMobileNavOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 text-white shadow-md shadow-zinc-900/20 hover:bg-zinc-800 transition-all active:scale-95 ${isSidebarCollapsed ? 'justify-center p-0 w-10 h-10' : ''}`}
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              {!isSidebarCollapsed && <span className="text-[12px] font-bold">New Project</span>}
            </button>
          </div>
        </div>

        <div className="mt-auto p-4 relative">
           {isSidebarCollapsed ? (
             <button className="w-10 h-10 mx-auto bg-zinc-100 border border-zinc-200 rounded-xl flex items-center justify-center text-[10px] font-bold mb-4 hover:bg-zinc-200 transition-colors">TC</button>
           ) : (
             <button onClick={() => { setAppState('PRICING'); setMobileNavOpen(false); }} className="w-full text-left bg-zinc-50/50 rounded-2xl p-4 border border-zinc-100/50 mb-4 hover:bg-zinc-100 transition-all group overflow-hidden relative">
                <div className="flex items-center justify-between mb-3 relative z-10">
                  <p className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Workspace</p>
                  <span className={`text-[8px] px-2 py-0.5 rounded-md font-bold uppercase tracking-tighter ${plan !== 'FREE' ? 'bg-orange-100 text-orange-600' : 'bg-zinc-100 text-zinc-500 border border-zinc-200'}`}>
                    {plan === 'FREE' ? 'Miễn phí' : plan === 'BASIC' ? 'Cơ bản' : 'PRO'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mb-4 relative z-10">
                  <div className="w-8 h-8 bg-white rounded-lg border border-zinc-200 flex items-center justify-center text-[10px] font-bold shadow-sm">TC</div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-zinc-900">Your Team</span>
                    <span className="text-[9px] text-zinc-500 font-medium tracking-tight">
                      {monthlyQuotaLabel} / tháng
                    </span>
                  </div>
                </div>
                <div className="w-full bg-zinc-200/50 h-1 rounded-full overflow-hidden relative z-10">
                  <div className="bg-zinc-900 h-full transition-all duration-1000" style={{ width: `${monthlyQuotaPct}%` }} />
                </div>
                {/* Subtle gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-transparent to-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity" />
             </button>
           )}
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 pt-14 lg:pt-0">
        
        <AnimatePresence mode="wait">
          
          {/* 6. AI STUDIO HUB */}
          {appState === 'AI_STUDIO' && (
            <motion.div 
              key="ai_studio"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full bg-white flex flex-col overflow-y-auto p-4 md:p-12"
            >
              <header className="mb-12">
                <div className="flex items-center gap-2 text-zinc-900 font-bold text-xs uppercase tracking-widest mb-4">
                  <Sparkles className="w-4 h-4" />
                  AI Innovation Lab
                </div>
                <h1 className="text-4xl font-montserrat font-medium text-zinc-900 mb-4">AI Research Lab</h1>
                <p className="text-zinc-400 text-sm font-montserrat font-light max-w-2xl">
                  Experiment with our latest AI engines. Built for creators who want to stay ahead of the algorithm.
                </p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
                {[
                   { title: 'AI Talking Avatar', desc: 'Tạo nhân vật AI phát ngôn theo kịch bản của bạn với biểu cảm và cử động môi tự nhiên nhất.', icon: Users, stat: 'Alpha Testing', status: 'Coming Soon' },
                   { title: 'AI Trend Predictor', desc: 'Phân tích dữ liệu TikTok/Reels để dự đoán chủ đề và âm nhạc nào sẽ dễ lên xu hướng nhất.', icon: TrendingUp, stat: 'Big Data AI', status: 'Pro Only' },
                   { title: 'Universal Dubbing', desc: 'Dịch thuật và lồng tiếng video của bạn sang 20+ ngôn ngữ mà vẫn giữ nguyên tone giọng gốc.', icon: Mic, stat: 'Global Growth', status: 'Coming Soon' },
                   { title: 'AI Storyboard Gen', desc: 'Chỉ cần nhập ý tưởng, AI sẽ tự động viết kịch bản và phân cảnh chi tiết cho video ngắn.', icon: LayoutGrid, stat: '10x Speedup', status: 'Pro Only' },
                   { title: 'Smart Subtitles Pro', desc: 'Công nghệ AI Captions nhận diện tiếng Việt cực chuẩn, tự động tạo highlight và icon.', icon: Type, stat: '99% Accuracy', status: 'Ready' },
                   { title: 'EverySunday Style (PRO)', desc: 'Áp dụng bộ viral styles (Alex, Iman, Beast) chỉ trong 1 lần click để video bắt mắt hơn.', icon: Zap, stat: 'Viral Ready', status: 'Active' }
                ].map((tool, i) => (
                  <div key={i} className="p-8 rounded-[32px] border border-zinc-100 bg-zinc-50/50 hover:bg-white hover:border-zinc-200 transition-all group cursor-pointer relative overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-zinc-100 group-hover:bg-zinc-900 group-hover:text-white transition-all shadow-sm">
                        <tool.icon className="w-6 h-6" />
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border uppercase tracking-widest ${tool.status === 'Ready' || tool.status === 'Active' ? 'bg-green-50 text-green-600 border-green-100' : tool.status === 'Coming Soon' ? 'bg-zinc-100 text-zinc-500 border-zinc-200' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                        {tool.status}
                      </span>
                    </div>
                    <h3 className="text-xl font-montserrat font-bold text-zinc-900 mb-2">{tool.title}</h3>
                    <p className="text-zinc-500 text-xs font-light leading-relaxed mb-6">{tool.desc}</p>
                    <div className="pt-6 border-t border-zinc-100 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">{tool.stat}</span>
                      <ChevronDown className="w-4 h-4 -rotate-90 text-zinc-300" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-zinc-900 rounded-[40px] p-12 text-white relative overflow-hidden">
                 <div className="relative z-10 max-w-xl">
                   <h2 className="text-3xl font-montserrat font-medium mb-4">Ready to go Viral?</h2>
                   <p className="text-zinc-400 font-light text-sm mb-8 leading-relaxed">
                     Unlock Smart B-rolls, Auto Magic Cuts, and 1080p export without watermarks. Join the top 1% of creators.
                   </p>
                   <button 
                     onClick={() => setAppState('PRICING')}
                     className="bg-zinc-900 hover:bg-zinc-800 text-white px-8 py-3 rounded-full font-bold text-sm transition-all shadow-xl shadow-zinc-900/20 active:scale-95"
                   >
                     GO PRO & GO VIRAL
                   </button>
                 </div>
                 <div className="absolute top-0 right-0 w-1/2 h-full opacity-30 pointer-events-none translate-x-20">
                   <Sparkles className="w-full h-full text-white/10" />
                 </div>
              </div>
            </motion.div>
          )}

          {/* 1. DASHBOARD */}
          {appState === 'DASHBOARD' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="h-full overflow-y-auto bg-white flex flex-col"
            >
              <nav className="h-16 px-4 md:px-12 flex items-center justify-end border-b border-zinc-50 shrink-0 sticky top-0 bg-white/80 backdrop-blur-md z-40">
                <div className="flex items-center gap-6">
                  {!plan || plan === 'FREE' ? (
                    <button 
                      onClick={() => {
                        setAppState('PRICING');
                      }}
                      className="text-xs font-montserrat font-medium text-zinc-900 cursor-pointer hover:text-zinc-700 transition-colors"
                    >
                      UPGRADE
                    </button>
                  ) : null}
                  <button 
                    onClick={() => setIsTutorialOpen(true)}
                    className="text-xs font-montserrat font-light text-zinc-400 cursor-pointer hover:text-zinc-900 transition-colors"
                  >
                    Tutorials
                  </button>
                  <Link to="/privacy" className="text-xs font-montserrat font-light text-zinc-400 hover:text-zinc-900">Privacy</Link>
                  <Link to="/terms" className="text-xs font-montserrat font-light text-zinc-400 hover:text-zinc-900">Terms</Link>
                  
                  {!user && (
                    <button 
                      onClick={handleLogin}
                      disabled={isLoggingIn}
                      className="flex items-center gap-2 justify-center px-6 py-2.5 rounded-full bg-zinc-900 text-white text-[11px] font-montserrat font-medium tracking-wider hover:bg-zinc-800 transition-all active:scale-95 shadow-lg"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      {isLoggingIn ? 'ĐANG ĐĂNG NHẬP...' : 'LOGIN'}
                    </button>
                  )}

                  {user ? (
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-zinc-900">{user.displayName}</span>
                        <span className="text-[9px] text-zinc-400 font-medium">{user.email}</span>
                      </div>
                      <button 
                        onClick={handleLogout}
                        className="p-2 hover:bg-zinc-50 rounded-lg text-zinc-400 hover:text-red-500 transition-colors"
                        title="Logout"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    </div>
                  ) : null}

                  <button 
                    onClick={() => setAppState('UPLOADING')}
                    className="bg-zinc-900 text-white px-6 py-2.5 rounded-full font-montserrat font-medium text-xs flex items-center gap-2 hover:bg-zinc-800 transition-all shadow-lg active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    CREATE PROJECT
                  </button>
                </div>
              </nav>

              <div className="flex-1 max-w-7xl mx-auto w-full px-12 pt-2 pb-20">
                <header className="mb-8">
                  <motion.h1 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-2xl font-montserrat tracking-tight leading-tight mb-2 text-zinc-900"
                  >
                    <span className="font-extralight text-zinc-400">Upload</span>
                    <span className="mx-2 text-zinc-200 text-lg">/</span>
                    <span className="font-bold">{BRAND.name}</span>
                    <span className="mx-2 text-zinc-200 text-lg">/</span>
                    <span className="font-bold text-zinc-900">Go Viral.</span>
                  </motion.h1>
                  
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-zinc-400 text-xs font-montserrat font-light max-w-lg leading-relaxed uppercase tracking-wider"
                  >
                    {BRAND.tagline}
                  </motion.p>
                </header>

                <div className="mb-12">
                  <h2 className="text-xl font-montserrat font-medium mb-6 text-zinc-900">Quick Start</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <FeatureCard 
                      title="AI Captions" 
                      desc="trendy styles & auto highlights" 
                      icon={Type} 
                      onClick={() => setAppState('UPLOADING')}
                      illustration={<CaptionIllustration />}
                      badge="VIRAL"
                    />
                    <FeatureCard 
                      title="Magic Edit" 
                      desc="Auto zooms & cinematic B-rolls" 
                      icon={Sparkles} 
                      onClick={() => setAppState('UPLOADING')}
                      illustration={<MagicCutIllustration />}
                      badge="HOT"
                    />
                    <FeatureCard 
                      title="Clean Audio (Beta)" 
                      desc="Preview audio cleanup workflow" 
                      icon={Mic} 
                      onClick={() => setAppState('UPLOADING')}
                      illustration={<div className="w-full h-full bg-zinc-100 flex items-center justify-center"><Mic className="w-10 h-10 text-zinc-300" /></div>}
                      badge="NEW"
                    />
                    <FeatureCard 
                      title="Magic Cut Preview" 
                      desc="Preview silence skips before export" 
                      icon={Scissors} 
                      onClick={() => setAppState('UPLOADING')}
                      illustration={<div className="w-full h-full bg-zinc-100 flex items-center justify-center"><Scissors className="w-10 h-10 text-zinc-300" /></div>}
                      badge="95% FASTER"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-xl font-montserrat font-medium text-zinc-900">My Projects</h2>
                    <button 
                      onClick={() => setAppState('UPLOADING')}
                      className="text-xs font-montserrat font-medium text-zinc-900 hover:text-zinc-700 transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> New Project
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                     {projects.length > 0 ? (
                       projects.map(project => (
                        <div key={project.id} className="aspect-[9/12] bg-white rounded-3xl border border-zinc-100 hover:border-zinc-200 transition-all overflow-hidden group shadow-sm flex flex-col cursor-pointer relative" onClick={() => setAppState('EDITOR')}>
                           <div className="flex-1 bg-zinc-100 relative overflow-hidden">
                              {project.thumbnailUrl ? (
                                <img src={project.thumbnailUrl} className="w-full h-full object-cover transition-transform group-hover:scale-105" alt={project.name} />
                              ) : (
                                <div className="w-full h-full bg-zinc-200 flex items-center justify-center"><Film className="w-8 h-8 text-zinc-400" /></div>
                              )}
                              <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-lg">
                                {project.duration}s
                              </div>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteProject(project.id);
                                }}
                                className="absolute top-3 left-3 bg-white/10 hover:bg-red-500/80 backdrop-blur-md p-2 rounded-xl text-white opacity-0 group-hover:opacity-100 transition-all z-10"
                                title="Delete project"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                           </div>
                           <div className="p-4">
                              <h4 className="text-sm font-bold text-zinc-900 truncate mb-1">{project.name}</h4>
                              <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">
                                {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'Draft'}
                              </p>
                           </div>
                        </div>
                       ))
                     ) : (
                       <div className="col-span-4 aspect-[2/1] bg-zinc-50 rounded-3xl border border-dashed border-zinc-200 flex flex-col items-center justify-center gap-3">
                          <FolderPlus className="w-10 h-10 text-zinc-200" />
                          <p className="text-xs font-montserrat font-light text-zinc-400">No projects yet. Start creating!</p>
                       </div>
                     )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {isTutorialOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-12"
              >
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsTutorialOpen(false)}
                  className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md"
                />
                
                <motion.div
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="relative w-full max-w-5xl aspect-video bg-black rounded-[32px] overflow-hidden shadow-2xl border border-white/10"
                >
                  <button 
                    onClick={() => setIsTutorialOpen(false)}
                    className="absolute top-6 right-6 z-10 w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-transparent z-0" />
                  
                  <div className="absolute bottom-10 left-10 z-10">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-2 h-2 bg-zinc-300 rounded-full animate-pulse" />
                      <span className="text-[10px] font-bold text-white/60 tracking-[0.2em] uppercase">Product Tour</span>
                    </div>
                    <h3 className="text-2xl font-montserrat font-bold text-white leading-tight">Hướng dẫn sử dụng {BRAND.name}</h3>
                  </div>

                  <iframe 
                    src="https://www.youtube.com/embed/-kit5yrgPWE?autoplay=1" 
                    title="Tutorial Video"
                    className="w-full h-full border-none"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 2. UPLOADING */}
          {appState === 'UPLOADING' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-zinc-50/50 backdrop-blur-3xl z-[100] flex items-center justify-center p-4"
            >
              <div className="bg-white w-full max-w-3xl rounded-[36px] shadow-[0_24px_80px_rgba(0,0,0,0.12)] overflow-hidden relative border border-zinc-100 p-2">
                <div className="border-2 border-dashed border-zinc-200 rounded-[30px] p-10 flex flex-col items-center text-center">
                  <button 
                    onClick={() => setAppState('DASHBOARD')} 
                    className="absolute top-7 right-7 p-2 hover:bg-zinc-100 rounded-full transition-all group"
                  >
                    <X className="w-5 h-5 text-zinc-300 group-hover:text-zinc-600" />
                  </button>

                  <div className="w-14 h-14 bg-zinc-100 rounded-2xl flex items-center justify-center mb-5 border border-zinc-200">
                    <Cloud className="w-7 h-7 text-zinc-900" />
                  </div>
                  
                  <h2 className="text-[52px] font-montserrat font-medium mb-4 tracking-[-0.04em] text-zinc-900 leading-tight">
                    <span className="text-zinc-900">Drop a video</span> or upload<br />
                    to generate captions
                  </h2>
                  
                  <p className="text-zinc-400 text-sm font-montserrat font-light mb-8">
                    MP4, MOV or MP3, Max duration: <span className="font-medium text-zinc-600">{plan === 'FREE' ? '1 phút' : '3 phút'}</span> Max size: <span className="font-medium text-zinc-600">{typeof window !== 'undefined' && window.location.hostname === 'localhost' ? '500MB (Admin Local)' : (plan === 'FREE' ? '50MB' : '100MB')}</span>
                    {plan === 'FREE' && (
                      <button 
                        onClick={() => setAppState('PRICING')}
                        className="ml-2 text-zinc-900 font-medium hover:underline decoration-1 underline-offset-4"
                      >
                        (Nâng cấp để xử lý video dài hơn)
                      </button>
                    )}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-[740px]">
                    <button 
                      onClick={triggerUpload}
                      className="w-full bg-zinc-900 text-white font-montserrat font-medium py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-zinc-800 transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-zinc-900/20"
                    >
                      <Monitor className="w-5 h-5" />
                      From my computer
                    </button>
                    <button 
                      className="w-full bg-white border border-zinc-200 text-zinc-900 font-montserrat font-medium py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-zinc-50 transition-all"
                    >
                      <QrCode className="w-5 h-5" />
                      From my phone
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* PRICING State */}
          {appState === 'PRICING' && (
            <motion.div 
              key="pricing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute inset-0 z-[110] overflow-y-auto bg-white flex flex-col items-center pt-8 pb-32 px-4 md:px-12"
            >
              <nav className="w-full max-w-7xl flex items-center justify-between mb-20">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setAppState('DASHBOARD')}>
                  <img 
                    src={BRAND.logoSrc} 
                    alt={BRAND.name} 
                    className="w-40 object-contain" 
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).nextElementSibling!.classList.remove('hidden');
                    }} 
                  />
                  <div className="hidden flex-row items-center gap-2">
                    <div className="w-8 h-8 bg-zinc-900 rounded flex items-center justify-center shrink-0">
                      <span className="text-white font-black text-sm leading-none">ES</span>
                    </div>
                    <span className="text-2xl font-black tracking-tighter">{BRAND.name}</span>
                  </div>
                </div>
                <button onClick={() => setAppState('DASHBOARD')} className="text-zinc-400 hover:text-zinc-900 transition-colors"><X className="w-6 h-6" /></button>
              </nav>

              <div className="text-center mb-16">
                <h1 className="text-4xl font-montserrat font-light tracking-tight text-zinc-900 mb-4 tracking-[-0.04em]">Master viral growth.</h1>
                <p className="text-zinc-400 font-montserrat font-light text-sm italic">"The optimized tool for short-form content — 30-60s processing, no waiting"</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl w-full">
                {/* MIỄN PHÍ */}
                <div className="bg-white p-10 rounded-[40px] border border-zinc-100 flex flex-col group hover:border-zinc-300 transition-colors shadow-sm">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-8 font-montserrat">Starter</h3>
                  <div className="flex items-baseline gap-1 mb-8">
                    <span className="text-5xl font-medium font-montserrat">0đ</span>
                    <span className="text-zinc-400 text-xs font-light">/forever</span>
                  </div>
                  <ul className="space-y-4 mb-12 flex-1">
                    <PricingFeature label="5 video / tháng" />
                    <PricingFeature label="Max video: 1 phút / 50MB" />
                    <PricingFeature label="Phụ đề Tiếng Việt chuẩn" />
                    <PricingFeature label="3 styles cơ bản" />
                    <PricingFeature label="Xuất video 720p (Watermark)" />
                  </ul>
                  <button className="w-full py-4 rounded-2xl border border-zinc-100 text-zinc-400 font-bold text-sm">CURRENT PLAN</button>
                </div>

                {/* CƠ BẢN */}
                <div className="bg-white p-10 rounded-[40px] border-2 border-orange-500 relative flex flex-col shadow-2xl shadow-orange-500/10 scale-105 z-10">
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-bold px-4 py-1.5 rounded-full uppercase tracking-widest">Best Value</div>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-900 mb-8 font-montserrat">Basic</h3>
                  <div className="flex items-baseline gap-1 mb-8">
                    <span className="text-5xl font-medium font-montserrat">79k</span>
                    <span className="text-zinc-400 text-xs font-light">/month</span>
                  </div>
                  <ul className="space-y-4 mb-12 flex-1">
                    <PricingFeature label="30 video / tháng" highlight />
                    <PricingFeature label="Max video: 3 phút / 100MB" highlight />
                    <PricingFeature label="Mở khoá TOÀN BỘ Styles" highlight />
                    <PricingFeature label="AI Remove Silence" />
                    <PricingFeature label="Xuất 1080p (Không Watermark)" />
                    <PricingFeature label="10 AI Studio credits/tháng" />
                  </ul>
                  <button 
                    onClick={() => handleUpgradeClick('BASIC')}
                    className="w-full py-4 rounded-2xl bg-orange-500 text-white font-bold text-sm hover:scale-[1.02] transition-transform active:scale-95 shadow-xl shadow-orange-500/20 disabled:opacity-50"
                  >
                    {plan === 'BASIC' ? 'ACTIVE' : 'UPGRADE NOW'}
                  </button>
                </div>

                {/* CHUYÊN NGHIỆP */}
                <div className="bg-white p-10 rounded-[40px] border border-zinc-100 flex flex-col group hover:border-zinc-300 transition-colors shadow-sm">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-8 font-montserrat">Pro</h3>
                  <div className="flex items-baseline gap-1 mb-8">
                    <span className="text-5xl font-medium font-montserrat">179k</span>
                    <span className="text-zinc-400 text-xs font-light">/month</span>
                  </div>
                  <ul className="space-y-4 mb-12 flex-1">
                    <PricingFeature label="100 video / tháng" />
                    <PricingFeature label="Max video: 3 phút / 100MB" />
                    <PricingFeature label="Không giới hạn AI credits" />
                    <PricingFeature label="Publish TikTok/Reels (sắp ra mắt)" />
                    <PricingFeature label="Brand Kit chuyên nghiệp" />
                    <PricingFeature label="Xử lý ưu tiên (Priority)" />
                  </ul>
                  <button 
                    onClick={() => handleUpgradeClick('PRO')}
                    className="w-full py-4 rounded-2xl bg-zinc-900 text-white font-bold text-sm hover:bg-zinc-800 transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-zinc-900/20 disabled:opacity-50"
                  >
                    {plan === 'PRO' ? 'ACTIVE' : 'UPGRADE PRO'}
                  </button>
                </div>
              </div>

              <div className="mt-20 max-w-4xl w-full bg-white rounded-[40px] p-10 border border-zinc-100 flex items-center justify-between shadow-sm">
                 <div className="text-left">
                   <h4 className="text-lg font-medium text-zinc-900 mb-1">Gói Agency / Doanh nghiệp</h4>
                   <p className="text-xs text-zinc-400 font-light">Xử lý khối lượng video cực lớn hoặc tích hợp API cho đội ngũ sản xuất.</p>
                 </div>
                 <button className="px-8 py-3 rounded-xl border border-zinc-100 text-zinc-900 text-sm font-bold hover:bg-zinc-50 transition-colors">Liên hệ tư vấn</button>
              </div>
            </motion.div>
          )}

          {/* 2.5 UPLOAD CONFIG */}
          {appState === 'UPLOAD_CONFIG' && (
            <motion.div 
              key="upload-config"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 lg:p-12 font-inter"
            >
              <div className="bg-white w-full max-w-4xl rounded-[48px] shadow-2xl overflow-hidden relative flex h-[80vh]">
                
                {/* Preview Side */}
                <div className="flex-1 bg-zinc-900 flex items-center justify-center p-8 relative overflow-hidden">
                   <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900 opacity-50" />
                   <div className="h-full aspect-[9/16] bg-black rounded-3xl overflow-hidden shadow-2xl border-[4px] border-zinc-800 relative z-10">
                      {videoUrl && (
                        <video 
                          ref={configVideoRef}
                          src={videoUrl} 
                          className="w-full h-full object-cover"
                          controls
                        />
                      )}
                   </div>
                </div>

                {/* Config Side */}
                <div className="w-[400px] flex flex-col bg-white">
                  <header className="p-8 border-b border-zinc-50 flex items-center justify-between shrink-0">
                     <h2 className="text-2xl font-black italic tracking-tight">AI Settings</h2>
                     <button onClick={() => setAppState('UPLOADING')} className="p-2 hover:bg-zinc-50 rounded-xl transition-all">
                       <X className="w-5 h-5 text-zinc-300" />
                     </button>
                  </header>

                  <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                     <section>
                       <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-6">Video Language</h3>
                       <div className="grid grid-cols-1 gap-2">
                          {['Vietnamese', 'English', 'Auto Detect'].map(lang => (
                            <button 
                              key={lang}
                              onClick={() => setLanguage(lang)}
                              className={`flex items-center justify-between px-6 py-4 rounded-2xl border transition-all ${language === lang ? 'bg-zinc-900 border-zinc-900 text-white shadow-xl' : 'bg-white border-zinc-100 hover:bg-zinc-50 text-zinc-500'}`}
                            >
                              <span className="font-bold text-sm tracking-tight">{lang === 'Vietnamese' ? 'Vietnamese' : lang === 'English' ? 'English' : 'Auto Detect'}</span>
                              {language === lang && <Check className="w-4 h-4 text-white" />}
                            </button>
                          ))}
                       </div>
                     </section>
                  </div>

                  <div className="p-8 border-t border-zinc-50 shrink-0">
                    <button 
                      onClick={generateCaptions}
                      className="w-full bg-orange-500 text-white font-black py-5 rounded-[24px] hover:bg-orange-600 transition-all shadow-xl shadow-orange-100 text-lg tracking-tight active:scale-[0.98]"
                    >
                      Start AI Processing
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* 3. PROCESSING (Submagic AI Style) */}
          {appState === 'PROCESSING' && (
            <motion.div 
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex p-12 bg-zinc-50"
            >
              <div className="flex-1 flex flex-col md:flex-row gap-8 max-w-7xl mx-auto">
                {/* Left: Progress Status */}
                <div className="flex-1 bg-white rounded-[40px] p-16 shadow-sm border border-zinc-100 flex flex-col justify-center">
                  <div className="max-w-md mx-auto w-full">
                    <h2 className="text-3xl font-black mb-2 tracking-tight">AI is processing...</h2>
                    <p className="text-zinc-500 text-xl font-medium mb-12">
                      {error ? "Processing failed" : (
                         jobStatus.startsWith('Đang tải video lên kho lưu trữ...') ? "Uploading video to storage..." :
                         jobStatus.startsWith('Đang tải video lên máy chủ...') ? "Uploading video to server..." :
                         jobStatus === 'Đang khởi tạo tiến trình AI...' ? "Creating AI job..." :
                         jobStatus === 'queued' ? `Waiting in queue${queuePosition ? ` (#${queuePosition})` : ''}...` :
                         jobStatus === 'downloading' ? "Downloading video..." :
                         jobStatus === 'extracting' ? "Extracting audio from video..." :
                         jobStatus === 'chunking_audio' ? "Splitting audio for AI transcription..." :
                         jobStatus === 'transcribing' ? "Analyzing speech & generating captions..." :
                         jobStatus === 'processing' ? "Starting worker..." :
                         jobStatus === 'done' ? "Finalizing..." : "Initializing process..."
                      )}
                    </p>
                    {currentJobId && (
                      <p className="text-xs text-zinc-400 mb-6 font-mono break-all">jobId: {currentJobId}</p>
                    )}
                    
                        {error ? (
                          <div className="p-8 bg-red-50 border border-red-100 rounded-[32px] text-center space-y-5">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                              <AlertCircle className="w-8 h-8 text-red-600" />
                            </div>
                            
                            <div>
                               <h3 className="text-red-900 font-black text-xl mb-2">Error Occurred</h3>
                               <p className="text-red-600 text-sm font-medium leading-relaxed mb-6">{error}</p>
                            </div>

                            <div className="flex flex-col gap-3 pt-4 border-t border-red-100 italic">
                               <div className="p-4 bg-white/50 rounded-2xl border border-red-200 text-xs text-red-500 mb-4 text-left">
                                  <p className="font-bold mb-1">Hướng xử lý nhanh:</p>
                                  <ul className="list-disc list-inside space-y-2">
                                    <li>Kiểm tra kết nối mạng và thử lại.</li>
                                    <li>Nếu lỗi về hạn mức, hãy kiểm tra gói hoặc credits.</li>
                                    <li>Nếu lỗi kéo dài, thử lại bằng video khác hoặc tải lại trang.</li>
                                  </ul>
                               </div>
                               
                               <button 
                                 onClick={() => {
                                   setError(null);
                                   setAppState('UPLOAD_CONFIG');
                                 }}
                                 className="w-full bg-zinc-900 text-white py-5 rounded-[24px] font-black hover:bg-zinc-800 transition-all shadow-lg"
                               >
                                 Try again
                               </button>
                            </div>
                          </div>
                        ) : (
                      <div className="space-y-6">
                        <div className="mb-6">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Progress</span>
                            <span className="text-sm font-black text-zinc-900">{Math.max(0, Math.min(100, Math.round(progress)))}%</span>
                          </div>
                          <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200">
                            <div className="h-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-500" style={{ width: `${Math.max(2, Math.min(100, progress))}%` }} />
                          </div>
                        </div>
                        <ProcessingStepSubmagic complete={progress > 10 || ['extracting','chunking_audio','transcribing','done'].includes(jobStatus)} active={jobStatus.startsWith('Đang tải video lên kho lưu trữ...') || jobStatus.startsWith('Đang tải video lên máy chủ...') || jobStatus === 'Đang khởi tạo tiến trình AI...' || jobStatus === 'extracting' || jobStatus === 'downloading'} label="Extracting audio" />
                        <ProcessingStepSubmagic complete={progress > 50 || ['transcribing','done'].includes(jobStatus)} active={jobStatus === 'chunking_audio' || jobStatus === 'transcribing' || jobStatus === 'queued' || jobStatus === 'processing'} label="Transcribing via AI" />
                        <ProcessingStepSubmagic complete={progress >= 100 || jobStatus === 'done'} active={jobStatus === 'done'} label="Finalizing project" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Preview Blur */}
                <div className="w-full md:w-[450px] bg-white rounded-[40px] p-6 shadow-sm border border-zinc-100 flex items-center justify-center">
                   <div className="w-full aspect-[9/16] bg-zinc-100 rounded-[32px] overflow-hidden relative border border-zinc-100">
                      {videoUrl && (
                        <video 
                          src={videoUrl} 
                          className="w-full h-full object-cover blur-2xl opacity-50 scale-110"
                          muted 
                          autoPlay 
                          loop 
                        />
                      )}
                      {/* Loading Bar */}
                      <div className="absolute inset-0 flex items-center justify-center px-12">
                         <div className="w-full h-6 bg-white/80 backdrop-blur rounded-full overflow-hidden border border-white p-1">
                            <motion.div 
                              className="h-full bg-orange-500 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                            />
                         </div>
                      </div>
                   </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* 4. MAIN EDITOR (Submagic Style) */}
          {appState === 'EDITOR' && (
            <motion.div 
              key="editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="editor-dark flex flex-col h-full overflow-hidden"
            >
              {/* TOP BAR */}
              <header className="h-16 px-6 bg-white border-b border-zinc-100 flex items-center justify-between z-30 shrink-0">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setAppState('DASHBOARD')} className="p-2 hover:bg-zinc-50 rounded-xl transition-all">
                      <LayoutGrid className="w-5 h-5 text-zinc-400" />
                    </button>
                    <div className="h-4 w-px bg-zinc-200" />
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-[0.2em]">Project:</span>
                      <h1 className="font-black text-sm tracking-tight text-zinc-900">{fileName || BRAND.defaultProjectName}</h1>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg border border-green-100">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-green-700 uppercase tracking-widest">Auto-Saved</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsBrandKitOpen(true)}
                    className="px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                  >
                    Brand Kit
                  </button>
                  {lastExportUrl && (plan === 'PRO' || plan === 'BASIC') ? (
                    <button
                      type="button"
                      onClick={() => setIsTikTokPublishOpen(true)}
                      className="px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                    >
                      TikTok
                    </button>
                  ) : null}
                  <button 
                    onClick={handleExport}
                    disabled={isExporting}
                    className="flex items-center gap-2 px-6 py-2.5 bg-zinc-900 text-white rounded-xl text-xs font-black hover:bg-zinc-800 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExporting ? (
                       <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"/> {Math.max(0, Math.min(100, Math.round(exportProgress)))}%</>
                    ) : (
                       <><Download className="w-4 h-4" /> Export Video</>
                    )}
                  </button>
                </div>
              </header>

              {/* MAIN CONTENT AREA */}
              <div className="flex flex-1 overflow-hidden relative">
                
                {/* LEFT PANEL: Sidebar & Script */}
                <AnimatePresence>
                  {!isPreviewOnly && (
                    <motion.div 
                      className="w-[420px] bg-white border-r border-zinc-100 flex flex-col shadow-sm shrink-0"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 420, opacity: 1 }}
                      exit={{ width: 0, opacity: 0, overflow: 'hidden' }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                    >
                      {/* Top Bar for Sidebar */}
                      <div className="flex p-4 gap-2 border-b border-zinc-50 overflow-x-auto shrink-0 scrollbar-hide items-center justify-between">
                        {activeTab === 'MENU' ? (
                          <h2 className="text-zinc-900 font-bold text-sm tracking-widest uppercase">Editor</h2>
                        ) : (
                          <button 
                            onClick={() => setActiveTab('MENU')}
                            className="flex items-center gap-2 text-zinc-400 hover:text-zinc-900 transition-colors py-2"
                          >
                            <ChevronDown className="w-5 h-5 rotate-90" />
                            <span className="text-[11px] font-black uppercase tracking-widest">Back</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={toggleChatSidebar}
                          className="h-9 w-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-800 transition-colors"
                          title={activeTab === 'CHAT_EDIT' ? 'Đóng chat' : 'Mở chat'}
                        >
                          <MoreHorizontal className="w-5 h-5" />
                        </button>
                  </div>

                  {/* Sidebar Content Scroll Area */}
                  <div className="flex-1 flex flex-col bg-white overflow-hidden">
                    {activeTab === 'MENU' && (
                      <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar space-y-8 animate-in fade-in slide-in-from-left-4">
                        
                        {/* Edit Section */}
                        <section className="space-y-4">
                          <h3 className="text-xs font-black text-zinc-900 tracking-tight">Edit</h3>
                          <div className="grid grid-cols-5 gap-2">
                            <button onClick={() => setActiveTab('CAPTIONS')} className="flex flex-col items-center justify-center gap-2 py-4 px-2 bg-zinc-50 rounded-xl hover:bg-zinc-100 transition-colors">
                              <MessageSquare className="w-5 h-5 text-zinc-700" />
                              <span className="text-[10px] font-bold text-zinc-600">Captions</span>
                            </button>
                            <button onClick={() => setActiveTab('ADJUST')} className="flex flex-col items-center justify-center gap-2 py-4 px-2 bg-zinc-50 rounded-xl hover:bg-zinc-100 transition-colors">
                              <SlidersHorizontal className="w-5 h-5 text-zinc-700" />
                              <span className="text-[10px] font-bold text-zinc-600">Adjust</span>
                            </button>
                            <button className="flex flex-col items-center justify-center gap-2 py-4 px-2 bg-zinc-50 rounded-xl hover:bg-zinc-100 transition-colors opacity-50 cursor-not-allowed">
                              <Monitor className="w-5 h-5 text-zinc-700" />
                              <span className="text-[10px] font-bold text-zinc-600">Edit Scenes</span>
                            </button>
                            <button className="flex flex-col items-center justify-center gap-2 py-4 px-2 bg-zinc-50 rounded-xl hover:bg-zinc-100 transition-colors opacity-50 cursor-not-allowed">
                              <Scissors className="w-5 h-5 text-zinc-700" />
                              <span className="text-[10px] font-bold text-zinc-600">Trim Video</span>
                            </button>
                            <button onClick={() => setActiveTab('TRANSITIONS')} className="flex flex-col items-center justify-center gap-2 py-4 px-2 bg-zinc-50 rounded-xl hover:bg-zinc-100 transition-colors">
                              <Replace className="w-5 h-5 text-zinc-700" />
                              <span className="text-[10px] font-bold text-zinc-600">Transition</span>
                            </button>
                          </div>
                        </section>

                        {/* AI Boost Section */}
                        <section className="space-y-4">
                          <h3 className="text-xs font-black text-zinc-900 tracking-tight">AI Boost</h3>
                          <div className="space-y-1">
                            {/* AI Captions */}
                            <div className="flex items-center justify-between p-3 rounded-xl hover:bg-zinc-50 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                                  <Sparkles className="w-4 h-4 text-zinc-700" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-zinc-900">AI Captions</span>
                                  <span className="text-[10px] text-zinc-400">{isAiCaptionsEnabled ? 'Styled subtitles enabled' : 'Off by default, user decides'}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => setActiveTab('STYLE')} className="px-3 py-1.5 text-[10px] font-bold border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors">Style</button>
                                <button onClick={() => setActiveTab('CAPTIONS')} className="px-3 py-1.5 text-[10px] font-bold border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors">Edit</button>
                                <button
                                  type="button"
                                  onClick={() => setIsAiCaptionsEnabled(prev => !prev)}
                                  className={`w-10 h-5 ${isAiCaptionsEnabled ? 'bg-orange-500' : 'bg-zinc-200'} rounded-full flex items-center p-0.5 ml-2 transition-colors`}
                                  aria-label="Toggle AI captions"
                                >
                                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isAiCaptionsEnabled ? 'translate-x-5' : ''}`} />
                                </button>
                              </div>
                            </div>
                            
                            {/* Remove Silences */}
                            <div className="flex items-center justify-between p-3 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer" onClick={handleMagicCut}>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                                  <VolumeX className="w-4 h-4 text-zinc-700" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-zinc-900">Remove Silences Preview</span>
                                  <span className="text-[10px] text-zinc-400">{isProcessingMagicCut ? 'Processing preview...' : 'Preview skipped pauses before final render'}</span>
                                </div>
                              </div>
                              <div className={`w-10 h-5 ${isMagicCutEnabled ? 'bg-orange-500' : 'bg-zinc-200'} rounded-full flex items-center p-0.5 transition-colors`}>
                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isMagicCutEnabled ? 'translate-x-5' : ''}`} />
                              </div>
                            </div>

                            {/* AI Auto Zooms */}
                            <div className="flex items-center justify-between p-3 rounded-xl hover:bg-zinc-50 transition-colors group cursor-pointer" onClick={() => handleGenerateZooms()}>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                                  <ZoomIn className="w-4 h-4 text-zinc-700" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-zinc-900">AI Auto Zooms</span>
                                  <span className="text-[10px] text-zinc-400">Auto-zoom on key moments</span>
                                </div>
                              </div>
                              <div className={`w-10 h-5 ${activeZooms.length > 0 ? 'bg-orange-500' : 'bg-zinc-200'} rounded-full flex items-center p-0.5 transition-colors`}>
                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${activeZooms.length > 0 ? 'translate-x-5' : ''}`} />
                              </div>
                            </div>

                            {/* AI Auto B-rolls */}
                            <div className="flex items-center justify-between p-3 rounded-xl hover:bg-zinc-50 transition-colors group cursor-pointer" onClick={handleAutoBrollToggle}>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                                  <Film className="w-4 h-4 text-zinc-700" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-zinc-900">AI Auto B-rolls</span>
                                  <span className="text-[10px] text-zinc-400">Swap moments with relevant footage</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); setActiveTab('CAPTIONS'); }} className="px-3 py-1.5 text-[10px] font-bold border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors">Manage</button>
                                <div className={`w-10 h-5 ${activeBrolls.length > 0 || brollSuggestions.length > 0 ? 'bg-orange-500' : 'bg-zinc-200'} rounded-full flex items-center p-0.5 transition-colors ml-2`}>
                                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${activeBrolls.length > 0 || brollSuggestions.length > 0 ? 'translate-x-5' : ''}`} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </section>

                        {/* AI Tools Section */}
                        <section className="space-y-4">
                          <h3 className="text-xs font-black text-zinc-900 tracking-tight">AI Studio</h3>
                          <div className="space-y-1">
                            {/* Snap Feature */}
                            <div className="flex items-center justify-between p-3 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer" onClick={handleSnapEdit}>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center relative shadow-inner">
                                  <Zap className={`w-4 h-4 ${isSnapStyleEnabled ? 'text-orange-600 fill-orange-600' : 'text-orange-500 fill-orange-500'}`} />
                                </div>
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-zinc-900">{BRAND.styleFeatureName}</span>
                                    <span className="bg-orange-100 text-orange-600 text-[8px] font-black uppercase px-1.5 py-0.5 rounded flex items-center gap-0.5"><Zap className="w-2 h-2 fill-orange-600" /> PRO</span>
                                  </div>
                                  <span className="text-[10px] text-zinc-500 font-medium">
                                    {isProcessingSnap ? 'AI Magic in progress...' : 'Apply Viral Package (Styles, B-rolls, Zooms)'}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {isSnapStyleEnabled && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveTab('TEXT_TRANSFORM');
                                    }}
                                    className="px-3 py-1.5 text-[10px] font-bold border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors"
                                  >
                                    Edit
                                  </button>
                                )}
                                <div className={`w-10 h-5 ${isSnapStyleEnabled ? 'bg-orange-500' : 'bg-zinc-200'} rounded-full flex items-center p-0.5 transition-colors`}>
                                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isSnapStyleEnabled ? 'translate-x-5' : ''}`} />
                                </div>
                              </div>
                            </div>
                            <div className="px-3 pb-2 -mt-1">
                              <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">Style Pace</span>
                                <div className="flex items-center gap-1">
                                  {(['slow', 'normal', 'fast'] as SnapPaceMode[]).map((mode) => (
                                    <button
                                      key={mode}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSnapPaceMode(mode);
                                      }}
                                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                                        snapPaceMode === mode
                                          ? 'bg-orange-500 text-white'
                                          : 'bg-white text-zinc-600 border border-zinc-200 hover:border-zinc-300'
                                      }`}
                                    >
                                      {mode}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                            
                            {/* Hook Title */}
                            <div className="flex items-center justify-between p-3 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer" onClick={handleHookTitle}>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                                  <Type className={isAIHookTitleEnabled ? "w-4 h-4 text-orange-500" : "w-4 h-4 text-zinc-700"} />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-zinc-900">AI Hook Title (Beta)</span>
                                  <span className="text-[10px] text-zinc-400">{isProcessingHookTitle ? 'Preparing preview...' : 'Preview hook placement workflow'}</span>
                                </div>
                              </div>
                              <div className={`w-10 h-5 ${isAIHookTitleEnabled ? 'bg-orange-500' : 'bg-zinc-200'} rounded-full flex items-center p-0.5 transition-colors`}>
                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isAIHookTitleEnabled ? 'translate-x-5' : ''}`} />
                              </div>
                            </div>
                            
                            {/* Clean Audio */}
                            <div className="flex items-center justify-between p-3 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer" onClick={handleCleanAudio}>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                                  <Mic className={isCleanAudioEnabled ? "w-4 h-4 text-orange-500" : "w-4 h-4 text-zinc-700"} />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-zinc-900">Clean Audio (Beta)</span>
                                  <span className="text-[10px] text-zinc-400">{isProcessingCleanAudio ? 'Đang xử lý...' : 'Áp dụng khi export video'}</span>
                                </div>
                              </div>
                              <div className={`w-10 h-5 ${isCleanAudioEnabled ? 'bg-orange-500' : 'bg-zinc-200'} rounded-full flex items-center p-0.5 transition-colors`}>
                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isCleanAudioEnabled ? 'translate-x-5' : ''}`} />
                              </div>
                            </div>
                          </div>
                        </section>
                      </div>
                    )}

                    {activeTab === 'CHAT_EDIT' && (
                      <div className="flex-1 overflow-hidden flex flex-col animate-in fade-in slide-in-from-left-4">
                        <div className="px-6 py-4 border-b border-zinc-100">
                          <h3 className="text-lg font-bold text-zinc-900">Chat Edit</h3>
                          <p className="text-xs text-zinc-500 mt-1">
                            Gõ yêu cầu như: bật EverySunday Style, cắt im lặng, thêm b-roll, tạo zoom.
                          </p>
                        </div>
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 custom-scrollbar">
                          {chatMessages.length === 0 && (
                            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                              <p className="text-xs text-zinc-500">
                                Ví dụ: "bật EverySunday Style và tạo auto zoom", "cắt im lặng rồi thêm b-roll".
                              </p>
                            </div>
                          )}
                          {chatMessages.map((msg, index) => (
                            <div key={index} className={`rounded-xl px-3 py-2 text-xs ${
                              msg.role === 'user'
                                ? 'bg-zinc-900 text-white'
                                : 'bg-zinc-50 border border-zinc-100 text-zinc-700'
                            }`}>
                              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            </div>
                          ))}
                          {isAiTyping && <p className="text-xs text-zinc-400">Đang xử lý...</p>}
                          {pendingChatPlan && (
                            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-2">
                              <p className="text-xs font-semibold text-zinc-700">Kế hoạch chờ áp dụng:</p>
                              <ul className="list-disc pl-4 text-xs text-zinc-700 space-y-1">
                                {pendingChatPlan.actions.map((action, index) => (
                                  <li key={`${action.type}_${index}`}>{action.label}</li>
                                ))}
                              </ul>
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={applyPendingChatPlan}
                                  disabled={isApplyingChatPlan}
                                  className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-semibold disabled:opacity-50"
                                >
                                  {isApplyingChatPlan ? 'Đang áp dụng...' : 'Áp dụng'}
                                </button>
                                <button
                                  onClick={cancelPendingChatPlan}
                                  disabled={isApplyingChatPlan}
                                  className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-700"
                                >
                                  Huỷ
                                </button>
                              </div>
                            </div>
                          )}
                          {chatEditLogs.length > 0 && (
                            <div className="rounded-xl border border-zinc-100 bg-white p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">Recent</p>
                              <div className="space-y-2">
                                {chatEditLogs.slice(0, 3).map((item) => (
                                  <div key={item.id} className="rounded-lg border border-zinc-100 px-2 py-2 text-[11px] text-zinc-600">
                                    <p className="font-semibold text-zinc-700">{item.status === 'applied' ? 'Đã áp dụng' : 'Thất bại'}</p>
                                    <p className="truncate">{item.actions.join(' · ')}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div ref={chatEndRef} />
                        </div>
                        <div className="p-4 border-t border-zinc-100 bg-white">
                          <div className="relative flex items-center bg-zinc-50 rounded-2xl border border-zinc-100 p-1">
                            <input
                              type="text"
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && sendMessageToAI()}
                              placeholder="Nhập lệnh chỉnh sửa..."
                              className="flex-1 bg-transparent border-none py-2 px-3 text-sm focus:ring-0"
                            />
                            <button
                              onClick={sendMessageToAI}
                              disabled={!chatInput.trim() || isAiTyping}
                              className="w-9 h-9 bg-zinc-900 text-white rounded-xl flex items-center justify-center hover:bg-orange-500 transition-all active:scale-95 disabled:opacity-30"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'STYLE' && (
                      <div className="flex-1 overflow-y-auto px-6 py-8 custom-scrollbar space-y-10 animate-in fade-in slide-in-from-left-4">
                        {isCustomizing ? (
                          <div className="space-y-8 pb-10">
                            {/* Top nav */}
                            <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
                              <button 
                                onClick={() => setIsCustomizing(false)}
                                className="flex items-center text-zinc-600 hover:text-zinc-900 transition-colors"
                              >
                                <ArrowLeft className="w-5 h-5" />
                              </button>
                              <div className="flex bg-zinc-100 p-1 rounded-lg">
                                <button className="px-4 py-1.5 bg-white text-zinc-900 text-xs font-bold rounded-md shadow-sm">Choose Style</button>
                                <button className="px-4 py-1.5 text-zinc-500 hover:text-zinc-900 text-xs font-bold rounded-md transition-colors" onClick={() => setActiveTab('CAPTIONS')}>Edit Captions</button>
                              </div>
                            </div>

                            {/* FONT section */}
                            <section className="space-y-6 pt-2">
                              <h3 className="text-xl font-bold text-zinc-900">Font</h3>
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Font Family</label>
                                  <div className="relative">
                                    <select 
                                      value={captionSettings.fontFamily || 'Montserrat'}
                                      onChange={(e) => setCaptionSettings(prev => ({ ...prev, fontFamily: e.target.value }))}
                                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-zinc-900 transition-all appearance-none"
                                    >
                                      <option value="Montserrat">Montserrat</option>
                                      <option value="Inter">Inter</option>
                                      <option value="Anton">Anton</option>
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <label className="text-xs font-semibold text-zinc-800">Font Weight</label>
                                    <label className="text-xs font-semibold text-zinc-800">Uppercase</label>
                                  </div>
                                  <div className="flex gap-2">
                                    <div className="relative flex-1">
                                      <select 
                                        value={captionSettings.fontWeight}
                                        onChange={(e) => setCaptionSettings(prev => ({ ...prev, fontWeight: e.target.value }))}
                                        className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-zinc-900 transition-all appearance-none"
                                      >
                                        <option value="400">Regular</option>
                                        <option value="600">SemiBold</option>
                                        <option value="800">ExtraBold</option>
                                        <option value="900">Black</option>
                                      </select>
                                      <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                    <div className="flex bg-zinc-100 p-0.5 rounded-lg shrink-0">
                                      <button 
                                        onClick={() => setCaptionSettings(prev => ({ ...prev, uppercase: true }))}
                                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${captionSettings.uppercase ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
                                      >Yes</button>
                                      <button 
                                        onClick={() => setCaptionSettings(prev => ({ ...prev, uppercase: false }))}
                                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${!captionSettings.uppercase ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
                                      >No</button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              <button className="bg-[#FF5A36] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#E0482B] transition-colors">Upload your own font</button>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-4">
                                  <label className="text-xs font-semibold text-zinc-800">Size</label>
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center border border-zinc-200 rounded-lg px-3 py-1.5 w-20">
                                      <input 
                                        type="number" 
                                        className="w-full text-sm font-semibold outline-none text-center" 
                                        value={captionSettings.fontSize}
                                        onChange={(e) => setCaptionSettings(prev => ({ ...prev, fontSize: parseInt(e.target.value) || 30 }))}
                                      />
                                      <span className="text-xs text-zinc-500 ml-1">px</span>
                                    </div>
                                    <input 
                                      type="range" 
                                      min="10" 
                                      max="120" 
                                      value={captionSettings.fontSize}
                                      onChange={(e) => setCaptionSettings(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                                      className="flex-1 h-1 bg-zinc-200 rounded-full appearance-none accent-zinc-800" 
                                    />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Font Color</label>
                                  <div className="w-full h-[38px] rounded-lg border border-zinc-200 overflow-hidden relative group">
                                     <div className="absolute inset-0 bg-transparent flex items-center justify-center">
                                       <div className="w-ull h-full" style={{ backgroundColor: captionSettings.primaryColor }} />
                                     </div>
                                     <input 
                                       type="color" 
                                       value={captionSettings.primaryColor}
                                       onChange={(e) => setCaptionSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                                       className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 opacity-0 cursor-pointer"
                                     />
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Stroke weight</label>
                                  <div className="flex p-0.5 bg-zinc-100 rounded-lg">
                                    {['None', 'Small', 'Medium', 'Large'].map(w => {
                                      const mappedWidth = w === 'None' ? 0 : w === 'Small' ? 2 : w === 'Medium' ? 5 : 8;
                                      const active = captionSettings.strokeWidth === mappedWidth;
                                      return (
                                        <button 
                                          key={w}
                                          onClick={() => setCaptionSettings(prev => ({ ...prev, strokeWidth: mappedWidth }))}
                                          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-700'}`}
                                        >
                                          {w}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Stroke Color</label>
                                  <div className="w-full h-[34px] rounded-lg border border-zinc-200 overflow-hidden relative group bg-black">
                                     <div className="absolute inset-0 bg-transparent flex items-center justify-center">
                                       <div className="w-full h-full" style={{ backgroundColor: captionSettings.strokeColor }} />
                                     </div>
                                     <input 
                                       type="color" 
                                       value={captionSettings.strokeColor}
                                       onChange={(e) => setCaptionSettings(prev => ({ ...prev, strokeColor: e.target.value }))}
                                       className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 opacity-0 cursor-pointer"
                                     />
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Shadow</label>
                                  <div className="flex p-0.5 bg-zinc-100 rounded-lg">
                                    {['None', 'Small', 'Medium', 'Large'].map(w => {
                                      const mappedBlur = w === 'None' ? 0 : w === 'Small' ? 4 : w === 'Medium' ? 10 : 20;
                                      const active = captionSettings.shadowBlur === mappedBlur;
                                      return (
                                        <button 
                                          key={w}
                                          onClick={() => setCaptionSettings(prev => ({ ...prev, shadowBlur: mappedBlur }))}
                                          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-700'}`}
                                        >
                                          {w}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Shadow Color</label>
                                  <div className="w-full h-[34px] rounded-lg border border-zinc-200 overflow-hidden relative group bg-black">
                                     <div className="absolute inset-0 bg-transparent flex items-center justify-center">
                                       <div className="w-full h-full" style={{ backgroundColor: captionSettings.shadowColor }} />
                                     </div>
                                     <input 
                                       type="color" 
                                       value={captionSettings.shadowColor.length === 7 ? captionSettings.shadowColor : '#000000'}
                                       onChange={(e) => setCaptionSettings(prev => ({ ...prev, shadowColor: e.target.value }))}
                                       className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 opacity-0 cursor-pointer"
                                     />
                                  </div>
                                </div>
                              </div>
                            </section>

                            {/* CAPTION section */}
                            <section className="space-y-6 pt-4 border-t border-zinc-100">
                              <h3 className="text-xl font-bold text-zinc-900">Caption</h3>
                              
                              <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-4">
                                  <label className="text-xs font-semibold text-zinc-800">Display word</label>
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center justify-center border border-zinc-200 rounded-lg px-2 py-1.5 w-16 bg-white">
                                      <span className="text-xs font-semibold">{captionSettings.displayWords} {captionSettings.displayWords === 1 ? 'word' : 'words'}</span>
                                    </div>
                                    <input 
                                      type="range" min="1" max="5" 
                                      value={captionSettings.displayWords}
                                      onChange={(e) => setCaptionSettings(prev => ({ ...prev, displayWords: parseInt(e.target.value) }))}
                                      className="flex-1 h-1 bg-zinc-200 rounded-full appearance-none accent-zinc-800" 
                                    />
                                  </div>
                                </div>
                                <div className="space-y-4">
                                  <label className="text-xs font-semibold text-zinc-800">Position Y</label>
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center justify-center border border-zinc-200 rounded-lg px-2 py-1.5 w-16 bg-white">
                                      <span className="text-xs font-semibold">{captionSettings.positionY} %</span>
                                    </div>
                                    <input 
                                      type="range" min="10" max="90" 
                                      value={captionSettings.positionY}
                                      onChange={(e) => setCaptionSettings(prev => ({ ...prev, positionY: parseInt(e.target.value) }))}
                                      className="flex-1 h-1 bg-zinc-200 rounded-full appearance-none accent-zinc-800" 
                                    />
                                  </div>
                                </div>
                                <div className="space-y-4">
                                  <label className="text-xs font-semibold text-zinc-800">Position X</label>
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center justify-center border border-zinc-200 rounded-lg px-2 py-1.5 w-16 bg-white">
                                      <span className="text-xs font-semibold">{captionSettings.positionX} %</span>
                                    </div>
                                    <input 
                                      type="range" min="10" max="90" 
                                      value={captionSettings.positionX}
                                      onChange={(e) => setCaptionSettings(prev => ({ ...prev, positionX: parseInt(e.target.value) }))}
                                      className="flex-1 h-1 bg-zinc-200 rounded-full appearance-none accent-zinc-800" 
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Animation</label>
                                  <div className="flex p-0.5 bg-zinc-100 rounded-lg w-max">
                                    <button onClick={() => setCaptionSettings(prev => ({ ...prev, animation: true }))} className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-colors ${captionSettings.animation ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>Yes</button>
                                    <button onClick={() => setCaptionSettings(prev => ({ ...prev, animation: false }))} className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-colors ${!captionSettings.animation ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>No</button>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Punctuation</label>
                                  <div className="flex p-0.5 bg-zinc-100 rounded-lg w-max">
                                    <button onClick={() => setCaptionSettings(prev => ({ ...prev, punctuation: true }))} className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-colors ${captionSettings.punctuation ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>Yes</button>
                                    <button onClick={() => setCaptionSettings(prev => ({ ...prev, punctuation: false }))} className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-colors ${!captionSettings.punctuation ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>No</button>
                                  </div>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Auto emoji</label>
                                  <div className="flex p-0.5 bg-zinc-100 rounded-lg w-max">
                                    <button onClick={() => setCaptionSettings(prev => ({ ...prev, autoEmoji: 'Auto' }))} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${captionSettings.autoEmoji === 'Auto' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>Auto</button>
                                    <button onClick={() => setCaptionSettings(prev => ({ ...prev, autoEmoji: 'Top' }))} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${captionSettings.autoEmoji === 'Top' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>Top</button>
                                    <button onClick={() => setCaptionSettings(prev => ({ ...prev, autoEmoji: 'None' }))} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${captionSettings.autoEmoji === 'None' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>None</button>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Break lines</label>
                                  <div className="flex p-0.5 bg-zinc-100 rounded-lg w-max">
                                    <button onClick={() => setCaptionSettings(prev => ({ ...prev, breakLines: true }))} className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-colors ${captionSettings.breakLines ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>Yes</button>
                                    <button onClick={() => setCaptionSettings(prev => ({ ...prev, breakLines: false }))} className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-colors ${!captionSettings.breakLines ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>No</button>
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Gap-free captions</label>
                                  <div className="flex p-0.5 bg-zinc-100 rounded-lg w-max">
                                    <button onClick={() => setCaptionSettings(prev => ({ ...prev, gapFree: true }))} className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-colors ${captionSettings.gapFree ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>Yes</button>
                                    <button onClick={() => setCaptionSettings(prev => ({ ...prev, gapFree: false }))} className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-colors ${!captionSettings.gapFree ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>No</button>
                                  </div>
                              </div>
                              
                              <div className="grid grid-cols-3 gap-4 pt-2">
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Main color</label>
                                  <div className="w-full h-9 rounded-lg border border-zinc-200" style={{ backgroundColor: captionSettings.primaryColor }} />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Second color</label>
                                  <div className="w-full h-[36px] rounded-lg border border-zinc-200 overflow-hidden relative group">
                                     <div className="absolute inset-0 bg-transparent flex items-center justify-center">
                                       <div className="w-full h-full" style={{ backgroundColor: captionSettings.secondColor }} />
                                     </div>
                                     <input 
                                       type="color" 
                                       value={captionSettings.secondColor}
                                       onChange={(e) => setCaptionSettings(prev => ({ ...prev, secondColor: e.target.value }))}
                                       className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 opacity-0 cursor-pointer"
                                     />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Third color</label>
                                  <div className="w-full h-[36px] rounded-lg border border-zinc-200 overflow-hidden relative group">
                                     <div className="absolute inset-0 bg-transparent flex items-center justify-center">
                                       <div className="w-full h-full" style={{ backgroundColor: captionSettings.thirdColor }} />
                                     </div>
                                     <input 
                                       type="color" 
                                       value={captionSettings.thirdColor}
                                       onChange={(e) => setCaptionSettings(prev => ({ ...prev, thirdColor: e.target.value }))}
                                       className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 opacity-0 cursor-pointer"
                                     />
                                  </div>
                                </div>
                              </div>
                            </section>

                            {/* Emphasized text section */}
                            <section className="space-y-4 pt-4 border-t border-zinc-100">
                              <div className="flex items-center gap-1.5">
                                <h3 className="text-lg font-bold text-zinc-900">Emphasized text</h3>
                                <div className="w-4 h-4 rounded-full border border-zinc-300 flex items-center justify-center text-[10px] text-zinc-400 font-bold">i</div>
                              </div>
                              <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Animation</label>
                                  <div className="relative">
                                    <select 
                                      value={captionSettings.emphasizedAnimation}
                                      onChange={(e) => setCaptionSettings(prev => ({ ...prev, emphasizedAnimation: e.target.value }))}
                                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm outline-none appearance-none font-medium">
                                      <option value="Default">Default</option>
                                      <option value="Pop">Pop</option>
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Font Color</label>
                                  <div className="w-full h-[36px] rounded-lg border border-zinc-200 overflow-hidden relative group">
                                     <div className="absolute inset-0 bg-transparent flex items-center justify-center">
                                       <div className="w-full h-full" style={{ backgroundColor: captionSettings.emphasizedColor }} />
                                     </div>
                                     <input 
                                       type="color" 
                                       value={captionSettings.emphasizedColor}
                                       onChange={(e) => setCaptionSettings(prev => ({ ...prev, emphasizedColor: e.target.value }))}
                                       className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 opacity-0 cursor-pointer"
                                     />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Background Color</label>
                                  <div className="w-full h-[36px] rounded-lg border border-zinc-200 overflow-hidden relative group bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAOklEQVQYV2N89erVfwY0wMjIyIhPjBSF+MTAAKYQpwhDkQhDkQhDkQhDkQhDkQhDkQhDkQhDkQhDEQDCYgM5o5R4XQAAAABJRU5ErkJggg==')]">
                                     <div className="absolute inset-0 bg-transparent flex items-center justify-center">
                                       <div className="w-full h-full" style={{ backgroundColor: captionSettings.emphasizedBackground }} />
                                     </div>
                                     <input 
                                       type="color" 
                                       value={captionSettings.emphasizedBackground}
                                       onChange={(e) => setCaptionSettings(prev => ({ ...prev, emphasizedBackground: e.target.value }))}
                                       className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 opacity-0 cursor-pointer"
                                     />
                                  </div>
                                </div>
                              </div>
                            </section>

                            {/* Animations section */}
                            <section className="space-y-4 pt-4 border-t border-zinc-100">
                              <h3 className="text-lg font-bold text-zinc-900">Animations</h3>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Caption Animation</label>
                                  <div className="relative">
                                    <select 
                                      value={
                                        captionSettings.captionAnimation === 'fade in'
                                          ? 'fade_in'
                                          : captionSettings.captionAnimation === 'slide up'
                                          ? 'slide_up'
                                          : captionSettings.captionAnimation
                                      }
                                      onChange={(e) => setCaptionSettings(prev => ({ ...prev, captionAnimation: e.target.value }))}
                                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm outline-none appearance-none font-medium">
                                      {TEXT_ANIMATION_LIBRARY.map((anim) => (
                                        <option key={anim.id} value={anim.id}>{anim.label}</option>
                                      ))}
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Word Animation</label>
                                  <div className="relative">
                                    <select 
                                      value={captionSettings.wordAnimation}
                                      onChange={(e) => setCaptionSettings(prev => ({ ...prev, wordAnimation: e.target.value }))}
                                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm outline-none appearance-none font-medium">
                                      <option value="None">None</option>
                                      <option value="Scale">Scale</option>
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-2">
                                  <label className="text-xs font-semibold text-zinc-800">Animation variants</label>
                                  <div className="flex p-0.5 bg-zinc-100 rounded-lg w-max">
                                    <button onClick={() => setCaptionSettings(prev => ({ ...prev, animationVariants: true }))} className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-colors ${captionSettings.animationVariants ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>Yes</button>
                                    <button onClick={() => setCaptionSettings(prev => ({ ...prev, animationVariants: false }))} className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-colors ${!captionSettings.animationVariants ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>No</button>
                                  </div>
                              </div>
                            </section>

                            {/* Video Background section */}
                            <section className="space-y-4 pt-4 border-t border-zinc-100">
                              <h3 className="text-lg font-bold text-zinc-900">Video Background</h3>
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-800">Background Color</label>
                                <div className="w-full max-w-[120px] h-[36px] rounded-lg border border-zinc-200 overflow-hidden relative group">
                                   <div className="absolute inset-0 bg-transparent flex items-center justify-center">
                                     <div className="w-full h-full" style={{ backgroundColor: captionSettings.videoBackground }} />
                                   </div>
                                   <input 
                                     type="color" 
                                     value={captionSettings.videoBackground}
                                     onChange={(e) => setCaptionSettings(prev => ({ ...prev, videoBackground: e.target.value }))}
                                     className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 opacity-0 cursor-pointer"
                                   />
                                </div>
                              </div>
                            </section>

                          </div>
                        ) : (
                          <div className="space-y-10">
                            <section>
                               <div className="flex items-center justify-between mb-6">
                                  <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Presets</h3>
                                  <button 
                                    onClick={() => setIsCustomizing(true)}
                                    className="text-[9px] font-black text-zinc-900 uppercase tracking-widest flex items-center gap-1.5 bg-zinc-50 px-3 py-1.5 rounded-full hover:bg-zinc-100 transition-colors"
                                  >
                                    <Highlighter className="w-3 h-3" /> Custom Design
                                  </button>
                               </div>
                               <div className="grid grid-cols-2 gap-3">
                                  {CAPTION_STYLES.map(style => (
                                    <StylePreview 
                                      key={style.id}
                                      active={selectedStyle === style.id}
                                      onClick={() => handleCaptionStyleSelect(style.id)}
                                      {...style}
                                    />
                                  ))}
                               </div>
                            </section>

                            <section className="space-y-4 pt-6 border-t border-zinc-100">
                              <div className="flex items-center justify-between">
                                <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Add Text</h3>
                                <button
                                  onClick={() => {
                                    addCustomTextOverlay();
                                    setActiveTab('TEXT_TRANSFORM');
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 transition-colors"
                                >
                                  + Add text
                                </button>
                              </div>
                              <p className="text-xs text-zinc-500">
                                Quản lý transform và kéo-thả trực tiếp ở tab <span className="font-semibold">Transform</span>.
                              </p>
                              {customTextOverlays.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {customTextOverlays.map((item, idx) => (
                                      <button
                                        key={item.id}
                                        onClick={() => {
                                          setSelectedCustomTextId(item.id);
                                          setActiveTab('TEXT_TRANSFORM');
                                        }}
                                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                        selectedCustomTextId === item.id
                                          ? 'bg-orange-50 border-orange-300 text-orange-700'
                                          : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300'
                                      }`}
                                    >
                                      Text {idx + 1}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <button
                                onClick={() => setActiveTab('TEXT_TRANSFORM')}
                                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition-colors"
                              >
                                Open Transform Tab
                              </button>
                            </section>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'TEXT_TRANSFORM' && (
                      <div className="flex-1 overflow-y-auto px-6 py-8 custom-scrollbar animate-in fade-in slide-in-from-left-4">
                        <section className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-zinc-900">Text Transform</h3>
                            <div className="flex items-center gap-2">
                              {isPasteStyleArmed && (
                                <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                                  Dán thuộc tính: chọn card
                                </span>
                              )}
                              <button
                                onClick={() => {
                                  addCustomTextOverlay();
                                  setActiveTab('TEXT_TRANSFORM');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 transition-colors"
                              >
                                + Add text
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-zinc-500">
                            Kéo-thả/resize trực tiếp trên preview. Double-click card trong list để sửa nhanh text.
                          </p>
                          {customTextOverlays.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-xs text-zinc-500">
                              Chưa có text overlay. Bấm <span className="font-semibold">+ Add text</span> để tạo.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                {[...customTextOverlays]
                                  .sort((a, b) => a.start - b.start)
                                  .map((item, idx) => (
                                    <div
                                      key={item.id}
                                      className={`relative w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                                        selectedCustomTextId === item.id
                                          ? 'bg-orange-50 border-orange-300'
                                          : 'bg-white border-zinc-200 hover:border-zinc-300'
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeCustomTextOverlay(item.id);
                                        }}
                                        className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full text-[10px] leading-none border border-zinc-300 text-zinc-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50"
                                        title="Remove"
                                      >
                                        x
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isPasteStyleArmed && copiedCustomTextStyle) {
                                            pasteCustomTextStyleTo(item.id);
                                            return;
                                          }
                                          setSelectedCustomTextId(item.id);
                                          setIsPasteStyleArmed(false);
                                        }}
                                        onDoubleClick={() => {
                                          setSelectedCustomTextId(item.id);
                                          setIsPasteStyleArmed(false);
                                          setEditingCustomTextId(item.id);
                                          setEditingCustomTextValue(item.text);
                                        }}
                                        className="w-full text-left"
                                      >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className={`text-[11px] font-bold pl-4 ${selectedCustomTextId === item.id ? 'text-orange-700' : 'text-zinc-500'}`}>
                                          {item.start.toFixed(2)} - {item.end.toFixed(2)}
                                        </span>
                                        <span className={`text-[11px] font-semibold ${selectedCustomTextId === item.id ? 'text-orange-600' : 'text-zinc-400'}`}>
                                          Text {idx + 1}
                                        </span>
                                      </div>
                                      {editingCustomTextId === item.id ? (
                                        <input
                                          ref={textInlineInputRef}
                                          value={editingCustomTextValue}
                                          onChange={(e) => setEditingCustomTextValue(e.target.value)}
                                          onBlur={() => {
                                            updateCustomTextOverlay(item.id, { text: editingCustomTextValue.trim() || item.text });
                                            setEditingCustomTextId(null);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              updateCustomTextOverlay(item.id, { text: editingCustomTextValue.trim() || item.text });
                                              setEditingCustomTextId(null);
                                            }
                                            if (e.key === 'Escape') {
                                              e.preventDefault();
                                              setEditingCustomTextId(null);
                                              setEditingCustomTextValue(item.text);
                                            }
                                          }}
                                          className="mt-1 w-full bg-white border border-zinc-200 rounded-lg px-2 py-1.5 text-sm font-semibold text-zinc-900"
                                        />
                                      ) : (
                                        <p className={`mt-1 text-sm font-semibold truncate ${selectedCustomTextId === item.id ? 'text-zinc-900' : 'text-zinc-700'}`}>
                                          {item.text || 'Text trống'}
                                        </p>
                                      )}
                                      </button>
                                    </div>
                                  ))}
                              </div>
                              {selectedCustomText && (
                                <div className="space-y-3 p-3 rounded-xl border border-zinc-200 bg-zinc-50">
                                  <div className="flex items-center justify-between gap-2">
                                    <label className="text-[11px] font-semibold text-zinc-700">Selected Text</label>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => removeCustomTextOverlay(selectedCustomText.id)}
                                        className="px-2 py-1 rounded-md text-[11px] font-semibold text-red-600 hover:bg-red-50"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                  <input
                                    value={selectedCustomText.text}
                                    onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { text: e.target.value })}
                                    className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                                    placeholder="Nhập nội dung..."
                                  />
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-zinc-700">Start (s)</label>
                                      <input type="number" step="0.1" value={selectedCustomText.start}
                                        onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { start: Math.max(0, Number(e.target.value || 0)) })}
                                        className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-zinc-700">End (s)</label>
                                      <input type="number" step="0.1" value={selectedCustomText.end}
                                        onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { end: Math.max(selectedCustomText.start + 0.2, Number(e.target.value || 0)) })}
                                        className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-zinc-700">Font size</label>
                                      <input type="range" min="18" max="160" value={selectedCustomText.fontSize}
                                        onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { fontSize: Number(e.target.value) })}
                                        className="w-full accent-zinc-800" />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-zinc-700">Font weight</label>
                                      <select
                                        value={selectedCustomText.fontWeight}
                                        onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { fontWeight: e.target.value })}
                                        className="w-full bg-white border border-zinc-200 rounded-lg px-2 py-1.5 text-xs font-semibold"
                                      >
                                        <option value="500">Medium</option>
                                        <option value="700">Bold</option>
                                        <option value="900">Black</option>
                                      </select>
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-zinc-700">Position X: {selectedCustomText.positionX.toFixed(1)}%</label>
                                      <input type="range" min="2" max="98" step="0.1" value={selectedCustomText.positionX}
                                        onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { positionX: Number(e.target.value) })}
                                        className="w-full accent-zinc-800" />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-zinc-700">Position Y: {selectedCustomText.positionY.toFixed(1)}%</label>
                                      <input type="range" min="2" max="98" step="0.1" value={selectedCustomText.positionY}
                                        onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { positionY: Number(e.target.value) })}
                                        className="w-full accent-zinc-800" />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-zinc-700">Anchor</label>
                                      <select
                                        value={selectedCustomText.horizontalAnchor || 'center'}
                                        onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { horizontalAnchor: e.target.value as CustomTextOverlay['horizontalAnchor'] })}
                                        className="w-full bg-white border border-zinc-200 rounded-lg px-2 py-1.5 text-xs font-semibold"
                                      >
                                        <option value="left">Left</option>
                                        <option value="center">Center</option>
                                        <option value="right">Right</option>
                                      </select>
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-zinc-700">Animation</label>
                                      <select
                                        value={(selectedCustomText.animationPreset || 'none') as TextAnimationId}
                                        onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { animationPreset: e.target.value as CustomTextOverlay['animationPreset'] })}
                                        className="w-full bg-white border border-zinc-200 rounded-lg px-2 py-1.5 text-xs font-semibold"
                                      >
                                        {TEXT_ANIMATION_LIBRARY.map((anim) => (
                                          <option key={anim.id} value={anim.id}>{anim.label}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-zinc-700">Color</label>
                                      <input type="color" value={selectedCustomText.color}
                                        onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { color: e.target.value })}
                                        className="w-full h-9 border border-zinc-200 rounded-lg" />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-zinc-700">Stroke</label>
                                      <input type="range" min="0" max="8" value={selectedCustomText.strokeWidth}
                                        onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { strokeWidth: Number(e.target.value) })}
                                        className="w-full accent-zinc-800" />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-zinc-700">Shadow</label>
                                      <input type="range" min="0" max="20" value={selectedCustomText.shadowBlur}
                                        onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { shadowBlur: Number(e.target.value) })}
                                        className="w-full accent-zinc-800" />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-zinc-700">Character Spacing: {selectedCustomText.characterSpacing ?? 0}px</label>
                                      <input type="range" min="-4" max="20" value={selectedCustomText.characterSpacing ?? 0}
                                        onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { characterSpacing: Number(e.target.value) })}
                                        className="w-full accent-zinc-800" />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-semibold text-zinc-700">Font Spacing: {Math.round(selectedCustomText.fontSpacing ?? 105)}%</label>
                                      <input type="range" min="80" max="180" value={selectedCustomText.fontSpacing ?? 105}
                                        onChange={(e) => updateCustomTextOverlay(selectedCustomText.id, { fontSpacing: Number(e.target.value) })}
                                        className="w-full accent-zinc-800" />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </section>
                      </div>
                    )}

                    {activeTab === 'ADJUST' && (
                      <div className="flex-1 overflow-y-auto px-6 py-8 custom-scrollbar animate-in fade-in slide-in-from-left-4">
                        <section className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-zinc-900">Video Adjustments</h3>
                            <button
                              onClick={() => setVideoAdjustments({ ...DEFAULT_VIDEO_ADJUSTMENTS })}
                              className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-100"
                            >
                              Reset
                            </button>
                          </div>
                          <p className="text-xs text-zinc-500">Tinh chỉnh màu/sáng preview và export đồng bộ.</p>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              ['exp', 'Exposure'], ['sat', 'Saturation'], ['tint', 'Tint'], ['contrast', 'Contrast'],
                              ['shadow', 'Shadow'], ['light', 'Light'], ['white', 'White'], ['black', 'Black'],
                              ['vibrance', 'Vibrance'], ['temp', 'Temp'],
                            ].map(([key, label]) => (
                              <div key={key} className="space-y-1">
                                <label className="text-[11px] font-semibold text-zinc-700">{label}: {(videoAdjustments as any)[key]}</label>
                                <input
                                  type="range"
                                  min="-100"
                                  max="100"
                                  value={(videoAdjustments as any)[key]}
                                  onChange={(e) => setVideoAdjustments((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                                  className="w-full accent-zinc-800"
                                />
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    )}

                    {activeTab === 'TRANSITIONS' && (
                      <div className="flex-1 overflow-y-auto px-6 py-8 custom-scrollbar animate-in fade-in slide-in-from-left-4">
                        <section className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-zinc-900">Transition Library</h3>
                            <span className="text-[11px] font-semibold text-zinc-500">Applied on export</span>
                          </div>
                          <p className="text-xs text-zinc-500">
                            Chọn hiệu ứng chuyển cảnh cho Magic Cut + biên vào/ra B-roll.
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            {TRANSITION_PRESETS.map((preset) => {
                              const active = selectedTransition === preset.id;
                              return (
                                <button
                                  key={preset.id}
                                  onClick={() => {
                                    setSelectedTransition(preset.id);
                                    notify(`Đã chọn transition: ${preset.name}.`, 'success');
                                  }}
                                  className={`text-left p-3 rounded-2xl border transition-all ${active ? 'border-orange-500 bg-orange-50 shadow-sm' : 'border-zinc-200 bg-white hover:border-zinc-300'}`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className={`text-sm font-bold ${active ? 'text-orange-600' : 'text-zinc-900'}`}>{preset.name}</p>
                                      <p className="text-[11px] text-zinc-500 mt-0.5">{preset.subtitle}</p>
                                    </div>
                                    <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${active ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
                                      {preset.duration}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      </div>
                    )}

                    {activeTab === 'CAPTIONS' && (
                      <div className="flex-1 overflow-hidden flex flex-col pt-2 animate-in fade-in slide-in-from-left-4">
                        {zoomPickerCaptionId ? (
                           <div className="flex-1 overflow-hidden flex flex-col bg-white">
                              <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
                                 <div className="flex items-center gap-4">
                                     <button onClick={() => setZoomPickerCaptionId(null)} className="p-2 -ml-2 rounded-xl hover:bg-zinc-100 transition-colors">
                                       <ArrowLeft className="w-5 h-5 text-zinc-900" />
                                     </button>
                                     <h3 className="font-bold text-zinc-900 text-lg">Zoom Library</h3>
                                 </div>
                              </header>
                              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-4 content-start">
                                 {['NONE', 'ZOOM_FAST', 'CRASH_ZOOM', 'CRASH_ZOOM_OUT', 'FAST_SNAP', 'FAST_HOLD', 'SMOOTH_PULSE', 'SMOOTH_HOLD', 'QUICK_IN', 'RAMP_EASE', 'STEADY_HOLD', 'STEADY_EASE', 'STEADY_SNAP', 'SMOOTH_IN', 'SMOOTH_OUT', 'STEADY_IN', 'STEADY_OUT'].map(type => {
                                     const start = captions.find(c => c.id === zoomPickerCaptionId)?.start || 0;
                                     const isActive = activeZooms.some(z => z.type === type && z.timestamp === start);
                                     
                                     return (
                                     <button 
                                        key={type}
                                        onClick={() => {
                                            let newZooms = activeZooms.filter(z => z.timestamp !== start);
                                            if (type !== 'NONE') {
                                               newZooms.push({
                                                  id: Math.random().toString(36).substring(7),
                                                  timestamp: start,
                                                  duration: 2.5,
                                                  type: type as ZoomType
                                               });
                                            }
                                            setActiveZooms(newZooms);
                                            setZoomPickerCaptionId(null);
                                        }}
                                        className={`flex flex-col items-center gap-3 p-3 pb-4 rounded-[24px] transition-all border-2 ${isActive ? 'border-orange-500 bg-orange-50 shadow-xl shadow-orange-500/10' : 'border-zinc-100 bg-zinc-50 hover:border-zinc-200 hover:bg-zinc-100'}`}
                                     >
                                        <div className={`w-full aspect-video rounded-xl overflow-hidden relative shadow-inner flex items-center justify-center ${type === 'NONE' ? 'bg-zinc-100' : 'bg-gradient-to-br from-zinc-800 to-zinc-900'}`}>
                                           {type === 'NONE' ? (
                                              <X className="w-8 h-8 text-zinc-300" />
                                           ) : (
                                              <div className={`w-8 h-8 border-2 border-white/20 rounded ${type.includes('OUT') ? 'scale-75' : 'scale-125'} transition-transform duration-500`} />
                                           )}
                                           {isActive && <div className="absolute top-2 right-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm"><Check className="w-3 h-3 text-white stroke-[3]"/></div>}
                                        </div>
                                        <span className={`text-xs font-bold leading-tight text-center ${isActive ? 'text-orange-600' : 'text-zinc-700'}`}>{type === 'NONE' ? 'None' : type.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}</span>
                                     </button>
                                  )})}
                              </div>
                           </div>
                        ) : brollPickerCaptionId ? (
                           <div className="flex-1 overflow-hidden flex flex-col bg-white">
                              <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
                                 <div className="flex items-center gap-4">
                                     <button onClick={() => setBrollPickerCaptionId(null)} className="p-2 -ml-2 rounded-xl hover:bg-zinc-100 transition-colors">
                                       <ArrowLeft className="w-5 h-5 text-zinc-900" />
                                     </button>
                                     <h3 className="font-bold text-zinc-900 text-lg">B-roll Library</h3>
                                 </div>
                              </header>
                              <div className="p-4 border-b border-zinc-100 flex items-center gap-2">
                                <input
                                  value={captionBrollQuery}
                                  onChange={(e) => setCaptionBrollQuery(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      searchCaptionBrollVideos(captionBrollQuery);
                                    }
                                  }}
                                  placeholder="Từ khóa B-roll theo card..."
                                  className="flex-1 bg-zinc-100 border border-zinc-200 rounded-xl px-3 py-2 text-sm"
                                />
                                <button
                                  onClick={() => searchCaptionBrollVideos(captionBrollQuery)}
                                  disabled={isSearchingCaptionBroll}
                                  className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-60"
                                >
                                  {isSearchingCaptionBroll ? 'Đang tìm...' : 'Tìm'}
                                </button>
                              </div>
                              <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start">
                                {captionBrollResults.map((video) => (
                                  <button
                                    key={video.id}
                                    onClick={() => handleAddCaptionBroll(brollPickerCaptionId, video)}
                                    className="group relative aspect-[9/16] bg-zinc-200 rounded-2xl overflow-hidden border border-zinc-100"
                                  >
                                    <img src={video.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center">
                                      <Plus className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </button>
                                ))}
                                {!isSearchingCaptionBroll && captionBrollResults.length === 0 && (
                                  <div className="col-span-2 py-12 text-center text-xs text-zinc-500">
                                    Chưa có kết quả. Hãy đổi keyword và tìm lại.
                                  </div>
                                )}
                              </div>
                           </div>
                        ) : transitionPickerCaptionId ? (
                           <div className="flex-1 overflow-hidden flex flex-col bg-white">
                              <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
                                 <div className="flex items-center gap-4">
                                     <button onClick={() => setTransitionPickerCaptionId(null)} className="p-2 -ml-2 rounded-xl hover:bg-zinc-100 transition-colors">
                                       <ArrowLeft className="w-5 h-5 text-zinc-900" />
                                     </button>
                                     <h3 className="font-bold text-zinc-900 text-lg">Transition Library</h3>
                                 </div>
                              </header>
                              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-4 content-start">
                                {TRANSITION_PRESETS.map((preset) => {
                                  const active = captionTransitions[transitionPickerCaptionId!]?.type === preset.id;
                                  return (
                                    <button
                                      key={preset.id}
                                      onClick={() => {
                                        setCaptionTransitions((prev) => ({
                                          ...prev,
                                          [transitionPickerCaptionId!]: { type: preset.id, updatedAt: Date.now() },
                                        }));
                                        setSelectedTransition(preset.id);
                                        setTransitionPickerCaptionId(null);
                                      }}
                                      className={`text-left p-3 rounded-2xl border transition-all ${active ? 'border-orange-500 bg-orange-50 shadow-sm' : 'border-zinc-200 bg-white hover:border-zinc-300'}`}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <p className={`text-sm font-bold ${active ? 'text-orange-600' : 'text-zinc-900'}`}>{preset.name}</p>
                                          <p className="text-[11px] text-zinc-500 mt-0.5">{preset.subtitle}</p>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${active ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
                                          {preset.duration}
                                        </span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                           </div>
                        ) : (
                           <div className="flex-1 overflow-y-auto pb-24 flex flex-col space-y-4">
                        <header className="flex flex-col border-b border-zinc-100 pb-2 shrink-0">
                           <div className="flex justify-between items-center px-4">
                              <div className="flex items-center gap-2">
                                <ArrowLeft className="w-4 h-4 text-zinc-900 cursor-pointer" onClick={() => setAppState('DASHBOARD')} />
                                <h3 className="font-medium text-[15px] text-zinc-900">Scenes</h3>
                              </div>
                              <div />
                           </div>
                           <div className="px-4 py-2 mt-2 bg-zinc-50 border-y border-zinc-100 flex items-center justify-center text-xs font-medium text-zinc-500 cursor-pointer hover:bg-zinc-100 transition-colors">
                              Add Intro
                           </div>
                        </header>
                        <div className="space-y-3 pb-24 px-2">
                          {captions.map(cap => (
                            <CaptionRow 
                              key={cap.id} 
                              start={cap.start || 0}
                              end={cap.end || (cap.start || 0) + 0.8}
                              text={cap.text || ''} 
                              active={activeCaption?.id === cap.id}
                              emoji={cap.emoji}
                              brolls={activeBrolls.filter(b => b.timestamp >= (cap.start || 0) && b.timestamp <= ((cap.end || (cap.start || 0) + 3)))}
                              onRemoveBroll={(id: string) => setActiveBrolls(activeBrolls.filter(b => b.id !== id))}
                              onAddBrollClick={() => openCaptionBrollPicker(cap)}
                              zooms={activeZooms.filter(z => z.timestamp >= (cap.start || 0) && z.timestamp <= ((cap.end || (cap.start || 0) + 3)))}
                              onRemoveZoom={(id: string) => setActiveZooms(activeZooms.filter(z => z.id !== id))}
                              onAddZoomClick={() => setZoomPickerCaptionId(cap.id)}
                              transitions={captionTransitions[cap.id] ? [captionTransitions[cap.id]] : []}
                              onRemoveTransition={() => setCaptionTransitions((prev) => {
                                const next = { ...prev };
                                delete next[cap.id];
                                return next;
                              })}
                              onAddTransitionClick={() => setTransitionPickerCaptionId(cap.id)}
                              onEdit={(newText: string) => {
                                setCaptions(captions.map(c => c.id === cap.id ? { ...c, text: newText } : c));
                              }}
                              onSeek={(time: number) => {
                                if (videoRef.current) {
                                  videoRef.current.currentTime = time;
                                  videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
                                }
                              }}
                              onPausePreview={() => {
                                if (videoRef.current) {
                                  videoRef.current.pause();
                                  setIsPlaying(false);
                                }
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      )}
                    </div>
                  )}

                    {activeTab === 'MAGIC_SCENES' && (
                       <div className="flex-1 overflow-y-auto px-0 py-8 custom-scrollbar space-y-8 animate-in fade-in slide-in-from-left-4">
                         <div className="px-4">
                            <h3 className="font-black text-2xl italic tracking-tight text-zinc-900 mb-2">Magic B-roll</h3>
                            <p className="text-[11px] text-zinc-400 font-medium leading-relaxed mb-6">
                              AI suggested visual overlays based on your script keywords.
                            </p>
                            
                            <button 
                              onClick={handleGenerateBrolls}
                              disabled={isAnalyzingBrolls}
                              className="w-full bg-zinc-900 text-white py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-zinc-800 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                            >
                              {isAnalyzingBrolls ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full" />
                                  <span className="text-xs font-black uppercase tracking-widest">AI Analyzing Script...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-4 h-4 text-orange-400 fill-orange-400" />
                                  <span className="text-xs font-black uppercase tracking-widest">
                                    {brollSuggestions.length > 0 ? "Re-Generate Suggestions" : "Auto-Suggest B-roll"}
                                  </span>
                                </>
                              )}
                            </button>
                            <button
                              onClick={handleApplyAutoBrollPlan}
                              disabled={brollSuggestions.length === 0 || isApplyingAutoBrollPlan}
                              className="w-full mt-3 bg-orange-500 text-white py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-orange-600 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                            >
                              {isApplyingAutoBrollPlan ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-white/40 border-t-white animate-spin rounded-full" />
                                  <span className="text-xs font-black uppercase tracking-widest">Auto Applying...</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-4 h-4" />
                                  <span className="text-xs font-black uppercase tracking-widest">Apply Full Auto Plan</span>
                                </>
                              )}
                            </button>

                            {/* Pexels Integration */}
                            <div className="mt-8 pt-8 border-t border-zinc-100">
                               <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-2">
                                     <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                        <Search className="w-4 h-4 text-emerald-600" />
                                     </div>
                                     <h4 className="text-xs font-black uppercase tracking-widest text-zinc-900">Stock Footage (Pexels)</h4>
                                  </div>
                                  <button 
                                     onClick={() => setShowPexelsPanel(!showPexelsPanel)}
                                     className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:bg-emerald-50 px-3 py-1 rounded-full transition-colors"
                                  >
                                     {showPexelsPanel ? 'Hide Search' : 'Open Search'}
                                  </button>
                               </div>

                               {showPexelsPanel && (
                                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                     <div className="flex gap-2">
                                        <input 
                                           type="text" 
                                           value={pexelsQuery}
                                           onChange={(e) => setPexelsQuery(e.target.value)}
                                           onKeyPress={(e) => e.key === 'Enter' && handlePexelsSearch()}
                                           placeholder="Keywords: cityscape, tech, nature..."
                                           className="flex-1 bg-zinc-50 border-none rounded-xl text-xs py-3 px-4 focus:ring-2 focus:ring-emerald-500 font-montserrat"
                                        />
                                        <button 
                                           onClick={handlePexelsSearch}
                                           disabled={isSearchingPexels}
                                           className="bg-emerald-500 text-white p-3 rounded-xl hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50"
                                        >
                                           {isSearchingPexels ? <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full" /> : <Search className="w-4 h-4" />}
                                        </button>
                                     </div>

                                     <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {pexelsResults.map((video) => (
                                           <div 
                                              key={video.id} 
                                              className="group relative aspect-[9/16] bg-zinc-100 rounded-2xl overflow-hidden cursor-pointer"
                                              onClick={() => handleAddPexelsBroll(video)}
                                           >
                                              <img src={video.image} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" alt="Pexels stock" />
                                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4">
                                                 <Plus className="w-8 h-8 text-white mb-2" />
                                                 <span className="text-[10px] font-black text-white uppercase tracking-widest text-center">Add at {formatTime(videoRef.current?.currentTime || 0)}</span>
                                              </div>
                                              <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 rounded-md text-[8px] font-bold text-white uppercase">
                                                 {video.duration}s
                                              </div>
                                           </div>
                                        ))}
                                     </div>
                                     
                                     {pexelsResults.length === 0 && !isSearchingPexels && (
                                        <p className="text-[10px] text-zinc-400 text-center italic py-4">Search for over 1M+ free high-quality stock videos.</p>
                                     )}
                                  </div>
                               )}
                            </div>
                         </div>
                         
                         <div className="space-y-6 px-4">
                            {brollSuggestions.length > 0 ? (
                              brollSuggestions.map((suggestion, idx) => (
                                <BrollSuggestionItem 
                                  key={idx}
                                  suggestion={suggestion}
                                  addedClip={activeBrolls.find(b => b.timestamp === suggestion.timestamp && b.keyword === suggestion.keyword)}
                                  onAdd={(clip: BrollClip) => {
                                    setActiveBrolls((prev) => {
                                      const exists = prev.some((b) => Math.abs(b.timestamp - clip.timestamp) < 0.2 && b.keyword.toLowerCase() === clip.keyword.toLowerCase());
                                      if (exists) return prev;
                                      return [...prev, clip].sort((a, b) => a.timestamp - b.timestamp);
                                    });
                                  }}
                                  onSeek={(time) => {
                                    if (videoRef.current) {
                                      videoRef.current.currentTime = time;
                                      videoRef.current.play();
                                      setIsPlaying(true);
                                    }
                                  }}
                                  getAuthHeaders={getOptionalAuthHeaders}
                                  onError={(message) => notify(message, "error")}
                                />
                              ))
                            ) : (
                              <div className="p-8 bg-zinc-50 rounded-3xl border border-dashed border-zinc-200 text-center">
                                <Film className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">No suggestions yet</p>
                              </div>
                            )}
                         </div>

                         {activeBrolls.length > 0 && (
                            <div className="pt-8 border-t border-zinc-100 px-4 pb-20">
                               <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-6">Applied B-rolls</h4>
                               <div className="space-y-4">
                                  {activeBrolls.map((clip) => (
                                    <div key={clip.id} className="flex items-center gap-4 group">
                                       <div className="w-20 h-12 bg-zinc-100 rounded-xl overflow-hidden border border-zinc-100 relative shrink-0">
                                          <video src={clip.previewUrl} className="w-full h-full object-cover" muted loop autoPlay />
                                       </div>
                                       <div className="flex-1 min-w-0">
                                          <p className="text-xs font-bold text-zinc-900 truncate">@{clip.timestamp}s: {clip.keyword}</p>
                                          <button 
                                            onClick={() => setActiveBrolls(activeBrolls.filter(b => b.id !== clip.id))}
                                            className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:text-red-600"
                                          >Remove</button>
                                       </div>
                                    </div>
                                  ))}
                               </div>
                            </div>
                         )}
                       </div>
                    )}
                  </div>
                </motion.div>
                )}
                </AnimatePresence>

                {/* RIGHT PANEL: Preview Section */}
                <div className="flex-1 flex flex-col relative overflow-hidden bg-white">
                  
                  {/* Viewport Area */}
                  <div className="flex-1 flex flex-col items-center justify-center min-h-0 pt-8 pb-4">
                     <div
                       ref={previewStageRef}
                       className={`h-full ${aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'} bg-black relative shadow-[0_10px_40px_rgba(0,0,0,0.1)] overflow-hidden group/video transition-all`}
                     >
                        {videoUrl ? (
                          <>
                            <video 
                              ref={videoRef}
                              src={videoUrl} 
                              className={`w-full h-full ${videoFit === 'cover' ? 'object-cover' : 'object-contain'}`}
                              style={{ 
                                  transform: `scale(${computeZoomScale(activeZooms, currentTime)})`,
                                  transformOrigin: '50% 50%',
                                  filter: previewVideoFilter
                              }}
                              onLoadedMetadata={handleLoadedMetadata}
                              onClick={handlePlayPause}
                            />
                            {/* B-roll Overlay */}
                            <AnimatePresence>
                              {(() => {
                                const activeBroll = activeBrolls.find(b => currentTime >= b.timestamp && currentTime < (b.timestamp + b.duration));
                                
                                return null;
                              })()}
                            </AnimatePresence>
                            <AnimatePresence>
                              {(() => {
                                const activeBroll = activeBrolls.find(b => currentTime >= b.timestamp && currentTime < (b.timestamp + b.duration));
                                if (activeBroll) {
                                  return (
                                    <motion.div 
                                      key={`broll-${activeBroll.id}`}
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      exit={{ opacity: 0 }}
                                      className="absolute inset-0 z-10 w-full h-full pointer-events-none"
                                    >
                                      <video 
                                        src={activeBroll.videoUrl} 
                                        poster={activeBroll.previewUrl}
                                        crossOrigin="anonymous"
                                        className="w-full h-full object-cover" 
                                        style={{ 
                                            transform: `scale(${computeZoomScale(activeZooms, currentTime)})`,
                                            transformOrigin: '50% 50%',
                                            filter: previewVideoFilter
                                        }}
                                        autoPlay 
                                        muted 
                                        loop
                                        playsInline
                                      />
                                    </motion.div>
                                  );
                                }
                                return null;
                              })()}
                            </AnimatePresence>
                          </>
                        ) : (
                          <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-800">
                             <Sparkles className="w-12 h-12 animate-pulse" />
                          </div>
                        )}
                        
                        {/* Captions Overlay - Safe Zone */}
                        <div className="absolute inset-x-0 inset-y-0 pointer-events-none z-20">
                            <AnimatePresence mode="wait">
                            {isAiCaptionsEnabled && activeCaption && !isSnapStyleEnabled && (
                              <div
                                key={activeCaption.id + selectedStyle + "wrap"}
                                style={{
                                  position: 'absolute',
                                  left: `${captionSettings.positionX}%`,
                                  top: `${captionSettings.positionY}%`,
                                  transform: 'translate(-50%, -50%)',
                                  width: '90%',
                                  zIndex: 50,
                                  display: 'flex',
                                  justifyContent: 'center'
                                }}
                              >
                                <motion.div
                                  initial={
                                    captionSettings.captionAnimation === 'slide up' || captionSettings.captionAnimation === 'slide_up'
                                      ? { opacity: 0, y: 10 }
                                      : captionSettings.captionAnimation === 'slide_down'
                                      ? { opacity: 0, y: -10 }
                                      : { opacity: 0 }
                                  }
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={
                                    captionSettings.captionAnimation === 'fade_out'
                                      ? { opacity: 0 }
                                      : captionSettings.captionAnimation === 'slide up' || captionSettings.captionAnimation === 'slide_up'
                                      ? { opacity: 0, y: -10 }
                                      : { opacity: 0 }
                                  }
                                  transition={{ duration: captionSettings.animation ? 0.2 : 0 }}
                                  style={{
                                    fontSize: `${captionSettings.fontSize}px`,
                                    color: captionSettings.primaryColor,
                                    textTransform: captionSettings.uppercase ? 'uppercase' : 'none',
                                    WebkitTextStroke: captionSettings.strokeWidth > 0 ? `${captionSettings.strokeWidth}px ${captionSettings.strokeColor}` : 'none',
                                    textShadow: `${captionSettings.shadowBlur}px ${captionSettings.shadowBlur}px ${captionSettings.shadowBlur}px ${captionSettings.shadowColor}`,
                                    fontFamily: captionSettings.fontFamily || 'Montserrat',
                                    backgroundColor: isSnapStyleEnabled ? 'rgba(0,0,0,0.5)' : 'transparent',
                                    padding: isSnapStyleEnabled ? '4px 12px' : '0',
                                    borderRadius: isSnapStyleEnabled ? '8px' : '0',
                                    backdropFilter: isSnapStyleEnabled ? 'blur(4px)' : 'none'
                                  }}
                                  className={`flex flex-wrap items-center justify-center ${captionSettings.gapFree ? 'gap-x-[0.1em]' : 'gap-x-[0.3em]'} drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] ${CAPTION_STYLES.find(s => s.id === selectedStyle)?.class}`}
                                >
                                  {captionSettings.autoEmoji === 'Top' && activeCaption.emoji && (
                                    <div className="w-full flex justify-center mb-1">
                                      <span className="text-[1.2em] drop-shadow-md">{activeCaption.emoji}</span>
                                    </div>
                                  )}
                                  {(() => {
                                  let baseText = activeCaption.text || '';
                                  if (captionSettings.captionAnimation === 'typewriter') {
                                    const start = Number(activeCaption.start || 0);
                                    const end = Math.max(start + 0.2, Number(activeCaption.end || start + 1.2));
                                    const progress = Math.max(0, Math.min(1, (currentTime - start) / (end - start)));
                                    const chars = Math.max(1, Math.floor(baseText.length * progress));
                                    baseText = baseText.slice(0, chars);
                                  }
                                  if (!captionSettings.punctuation) {
                                    baseText = baseText.replace(/[.,!?;]/g, '');
                                  }
                                  let allWords = baseText.split(' ');
                                  
                                  if (captionSettings.breakLines) {
                                     // Just a placeholder line break approach if user wants it (can be simulated with max-width if needed)
                                  }
                                  
                                  const displayWordsCount = captionSettings.displayWords;
                                  let displayedWords = allWords;
                                  
                                  const duration = (activeCaption.end || (activeCaption.start || 0) + 2) - (activeCaption.start || 0);
                                  const timePerWord = duration / Math.max(1, allWords.length);
                                  let elapsed = currentTime - (activeCaption.start || 0);
                                  if (elapsed < 0) elapsed = 0;
                                  const activeWordGlobalIndex = Math.max(0, Math.min(allWords.length - 1, Math.floor(elapsed / timePerWord)));

                                  if (displayWordsCount < allWords.length && selectedStyle !== 'iman2') {
                                    const chunkIndex = Math.floor(activeWordGlobalIndex / displayWordsCount);
                                    const startIdx = chunkIndex * displayWordsCount;
                                    displayedWords = allWords.slice(startIdx, startIdx + displayWordsCount);
                                  }

                                  if (selectedStyle === 'iman2') {
                                    const half = Math.ceil(allWords.length / 2);
                                    const top = allWords.slice(0, half).join(' ');
                                    const bottom = allWords.slice(half).join(' ');
                                    return (
                                      <div className="flex flex-col items-center">
                                        <span className="caption-iman2-top" style={{ fontSize: '0.7em', color: captionSettings.secondColor }}>{top}</span>
                                        <span className="caption-iman2-bottom" style={{ fontWeight: captionSettings.fontWeight as any }}>{bottom}</span>
                                      </div>
                                    );
                                  }

                                  return displayedWords.map((word, i) => {
                                    let globalWordIndex = i;
                                    if (displayWordsCount < allWords.length && selectedStyle !== 'iman2') {
                                       const chunkIndex = Math.floor(activeWordGlobalIndex / displayWordsCount);
                                       globalWordIndex = chunkIndex * displayWordsCount + i;
                                    }

                                    const isActiveInHormozi = globalWordIndex === activeWordGlobalIndex;
                                    
                                    const cleanWord = word.replace(/[.,!?;]/g, '').toLowerCase();
                                    const cleanHighlight = (activeCaption.highlight || '').toLowerCase();
                                    const isHighlight = cleanHighlight && cleanWord === cleanHighlight;
                                    const isNumeric = /[0-9]/.test(cleanWord);
                                    
                                    if (selectedStyle === 'hormozi') {
                                       const shouldHighlight = isHighlight || isNumeric;
                                       return (
                                          <span 
                                            key={i} 
                                            className={`caption-hormozi-word`}
                                            style={{ 
                                              filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.5))",
                                              fontWeight: shouldHighlight ? 900 : 700,
                                              color: shouldHighlight ? captionSettings.secondColor : captionSettings.primaryColor,
                                              WebkitTextStroke: shouldHighlight ? `${captionSettings.strokeWidth}px ${captionSettings.strokeColor}` : `${Math.max(1, captionSettings.strokeWidth - 1)}px ${captionSettings.strokeColor}`,
                                              transform: isActiveInHormozi && captionSettings.animation ? 'scale(1.1)' : 'scale(1)',
                                              transition: 'transform 0.1s ease-out'
                                            }}
                                          >
                                            {word}
                                          </span>
                                       );
                                    }

                                    if (selectedStyle === 'alex') {
                                       return (
                                          <span 
                                            key={`alex-${globalWordIndex}`} 
                                            className={`caption-alex-word caption-alex-pop`}
                                            style={{ 
                                              color: isActiveInHormozi && captionSettings.animation ? '#FFE700' : '#FFFFFF',
                                              margin: '0 0.1em'
                                            }}
                                          >
                                            {word}
                                          </span>
                                       );
                                    }

                                    // Generic / Iman
                                    let color = captionSettings.primaryColor;
                                    let bgColor = 'transparent';
                                    let transform = 'scale(1)';

                                    if (isHighlight) {
                                      color = captionSettings.emphasizedColor;
                                      bgColor = captionSettings.emphasizedBackground;
                                      if (captionSettings.emphasizedAnimation === 'Pop') {
                                         transform = 'scale(1.15)';
                                      } else if (selectedStyle === 'iman') {
                                         color = captionSettings.secondColor;
                                      } else {
                                        transform = 'scale(1.1)';
                                      }
                                    }

                                    return (
                                      <span 
                                        key={i} 
                                        className={`inline-block transition-transform ${isHighlight && captionSettings.emphasizedBackground !== 'transparent' ? 'px-2 py-0.5 rounded-lg' : ''}`}
                                        style={{ 
                                          fontWeight: captionSettings.fontWeight as any,
                                          color,
                                          backgroundColor: bgColor,
                                          transform
                                        }}
                                      >
                                        {word}
                                      </span>
                                    );
                                  });
                                })()}
                                {captionSettings.autoEmoji === 'Auto' && activeCaption.emoji && (
                                  <span className="ml-2 text-[0.8em] inline-block drop-shadow-md">{activeCaption.emoji}</span>
                                )}
                                </motion.div>
                              </div>
                            )}
                          </AnimatePresence>
                        </div>
                        {isSnapStyleEnabled && isSnapOverlayEnabled && (
                          <div className="absolute inset-0 pointer-events-none z-20">
                            <img
                              src={SNAP_OVERLAY_ASSET}
                              alt="everysunday-overlay"
                              className="w-full h-full object-cover"
                              style={{
                                opacity: Math.max(0, Math.min(1, currentTime / 1)),
                              }}
                            />
                          </div>
                        )}
                        {previewCustomTexts.length > 0 && (
                          <div className={`absolute inset-0 z-30 ${isTextTransformTab ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                            {previewCustomTexts.map((item) => (
                              (() => {
                                const anchor = item.horizontalAnchor || 'center';
                                const textAlign = anchor === 'left' ? 'left' : anchor === 'right' ? 'right' : 'center';
                                const translateX = anchor === 'left' ? '0%' : anchor === 'right' ? '-100%' : '-50%';
                                const fontWeight = Number(item.fontWeight) >= 700 ? 700 : 500;
                                const isSelectedForTransform = isTextTransformTab && selectedCustomTextId === item.id;
                                return (
                              <div
                                key={`custom-text-${item.id}`}
                                style={{
                                  position: 'absolute',
                                  left: `${item.positionX}%`,
                                  top: `${item.positionY}%`,
                                  transform: `translate(${translateX}, -50%)`,
                                  width: anchor === 'center' ? '90%' : 'auto',
                                  textAlign,
                                }}
                                onPointerDown={(event) => {
                                  if (!isTextTransformTab) return;
                                  event.stopPropagation();
                                  beginTextDrag(event, item);
                                }}
                                onClick={(event) => {
                                  if (!isTextTransformTab) return;
                                  event.stopPropagation();
                                  if (suppressOverlayClickRef.current) return;
                                  setSelectedCustomTextId(item.id);
                                }}
                              >
                                <div className="relative inline-block">
                                    <span
                                      style={{
                                        opacity: (() => {
                                          const progress = getAnimationProgress(currentTime, item.start, item.entryDurationMs || 220);
                                          const enterOpacity = item.animationPreset === 'fade_out'
                                            ? (1 - progress)
                                            : item.animationPreset === 'none'
                                            ? 1
                                            : (1 - Math.pow(1 - progress, 3));
                                          const fadeOutSec = Math.max(0.08, (item.fadeOutDurationMs || 180) / 1000);
                                          const outStart = Math.max(item.start, item.end - fadeOutSec);
                                          const outProgress = Math.max(0, Math.min(1, (currentTime - outStart) / fadeOutSec));
                                          const exitOpacity = 1 - outProgress;
                                          return Math.max(0, Math.min(1, enterOpacity * exitOpacity));
                                        })(),
                                        fontSize: `${item.fontSize}px`,
                                        fontFamily: item.fontFamily || 'Montserrat',
                                        fontWeight,
                                        color: item.color,
                                        textTransform: item.uppercase ? 'uppercase' : 'none',
                                        WebkitTextStroke: item.strokeWidth > 0 ? `${item.strokeWidth}px ${item.strokeColor}` : 'none',
                                        textShadow: item.shadowBlur > 0 ? `${Math.round(item.shadowBlur / 2)}px ${Math.round(item.shadowBlur / 2)}px ${item.shadowBlur}px ${item.shadowColor}` : 'none',
                                        display: 'inline-block',
                                        letterSpacing: `${item.characterSpacing || 0}px`,
                                        lineHeight: `${Math.max(0.8, (item.fontSpacing || 105) / 100)}`,
                                        transform: (() => {
                                          const progress = getAnimationProgress(currentTime, item.start, item.entryDurationMs || 220);
                                          const eased = 1 - Math.pow(1 - progress, 3);
                                          if (item.animationPreset === 'none' || item.animationPreset === 'fade_in' || item.animationPreset === 'fade_out' || item.animationPreset === 'typewriter') {
                                            return 'none';
                                          }
                                          const baseOffset = item.translateYFromPx || 12;
                                          const signedOffset = item.animationPreset === 'slide_down' ? -Math.abs(baseOffset) : Math.abs(baseOffset);
                                          const y = (1 - eased) * signedOffset;
                                          const scale = (item.scaleFrom || 0.98) + (eased * (1 - (item.scaleFrom || 0.98)));
                                          return `translateY(${y}px) scale(${scale})`;
                                        })(),
                                        transition: 'opacity 80ms linear, transform 80ms linear',
                                        cursor: isTextTransformTab ? 'grab' : 'default',
                                        border: isSelectedForTransform ? '1px dashed rgba(255,255,255,0.9)' : 'none',
                                        borderRadius: isSelectedForTransform ? '8px' : '0',
                                        padding: isSelectedForTransform ? '4px 6px' : '0',
                                        touchAction: 'none',
                                      }}
                                      className="drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]"
                                    >
                                      {(() => {
                                        if (item.animationPreset !== 'typewriter') return item.text;
                                        const progress = getAnimationProgress(currentTime, item.start, item.entryDurationMs || 280);
                                        const chars = Math.max(1, Math.floor(item.text.length * progress));
                                        return item.text.slice(0, chars);
                                      })()}
                                    </span>
                                    {isSelectedForTransform && (
                                      <button
                                        type="button"
                                        onPointerDown={(event) => beginTextResize(event, item)}
                                        className="absolute -bottom-2 -right-2 w-4 h-4 rounded-sm border border-white bg-zinc-900/90 hover:bg-zinc-800 shadow-sm"
                                        style={{ cursor: 'nwse-resize' }}
                                        title="Resize"
                                      />
                                    )}
                                  </div>
                              </div>
                              );
                            })()
                            ))}
                          </div>
                        )}

                        {isTextTransformTab && (snapGuideState.x || snapGuideState.y) && (
                          <>
                            {snapGuideState.x && (
                              <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px pointer-events-none z-40 transition-all bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.9)]" />
                            )}
                            {snapGuideState.y && (
                              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px pointer-events-none z-40 transition-all bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.9)]" />
                            )}
                          </>
                        )}

                        {/* SAFE ZONE GUIDES (Helper) */}
                        <div className="absolute inset-x-8 top-12 h-px bg-white/10 pointer-events-none border-t border-dashed border-white/20" />
                        <div className="absolute inset-x-8 bottom-24 h-px bg-white/10 pointer-events-none border-t border-dashed border-white/20" />

                        {/* Center Play Button Overlay */}
                        {!isPlaying && videoUrl && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none transition-all z-30">
                            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 shadow-xl">
                              <Play className="w-6 h-6 text-white fill-current ml-1" />
                            </div>
                          </div>
                        )}
                     </div>
                     
                     {/* Under-video Toolbar */}
                     <div className="flex items-center gap-6 mt-6 text-zinc-700 text-sm h-10 shrink-0">
                        <button 
                          onClick={toggleAspectRatio}
                          className="flex items-center gap-1 hover:text-black bg-zinc-100 px-3 py-1.5 rounded-full transition-colors font-medium"
                        >
                          {aspectRatio} <ChevronDown className="w-4 h-4"/>
                        </button>
                        <button title="Toggle Fit" className={`hover:text-black transition-colors ${videoFit === 'contain' ? 'text-black bg-zinc-100 rounded-full px-2 py-1' : ''}`} onClick={() => setVideoFit(prev => prev === 'cover' ? 'contain' : 'cover')}><Crop className="w-4 h-4"/></button>
                        <button title="Rotate Right" className="hover:text-black" onClick={() => videoRef.current && (videoRef.current.currentTime += 90)}><RotateCw className="w-4 h-4"/></button>
                        <button title="Toggle Preview Only" className={`hover:text-black transition-colors ${isPreviewOnly ? 'text-black bg-zinc-100 rounded-full px-2 py-1' : ''}`} onClick={() => setIsPreviewOnly(!isPreviewOnly)}><Eye className="w-4 h-4"/></button>
                     </div>
                  </div>

                  {/* Playback Controls Area */}
                  <div className="px-8 pb-6 shrink-0 w-full flex flex-col gap-4">
                     {/* Timeline Scrubber */}
                     <div className="relative flex items-center h-1.5 bg-zinc-200 rounded-full cursor-pointer hover:h-2 transition-all group/seek overflow-hidden outline-none mx-2">
                         {isMagicCutEnabled && silenceSegments.length > 0 && duration > 0 && silenceSegments.map((segment, i) => (
                           <div
                             key={`${segment.start}-${segment.end}-${i}`}
                             className="absolute h-full z-10"
                             style={{
                               left: `${(segment.start / duration) * 100}%`,
                               width: `${((segment.end - segment.start) / duration) * 100}%`,
                               background: 'rgba(255, 0, 0, 0.4)'
                             }}
                           />
                         ))}
                        <input 
                          type="range" 
                          min={0} 
                          max={duration || 100} 
                          step="any"
                          value={currentTime}
                          onChange={handleSeek}
                          className="absolute inset-0 w-full h-full opacity-0 z-30 cursor-pointer" 
                        />
                        <div className="h-full bg-zinc-900 rounded-full relative z-20 pointer-events-none" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }} />
                     </div>
                     
                     {/* Bottom Row */}
                     <div className="flex items-center justify-between text-zinc-600 px-2 mt-2">
                        <button 
                          onClick={handlePlayPause}
                          className="w-9 h-9 rounded-lg border border-zinc-200 flex items-center justify-center hover:bg-zinc-50 transition-colors shadow-sm bg-white"
                        >
                          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                        </button>
                        
                        <div className="flex items-center gap-2 text-[13px] font-mono mr-auto ml-6">
                          <span className="font-medium text-black">{currentTime.toFixed(2)}</span>
                          <span className="text-zinc-400">/</span>
                          <span className="text-zinc-500">{duration.toFixed(2)}</span>
                        </div>
                        
                        <div className="flex items-center gap-5 relative">
                           <button title="Back 1 frame" className="hover:text-black" onClick={() => videoRef.current && (videoRef.current.currentTime -= 1/30)}><RotateCcw className="w-4 h-4" /></button>
                           <button title="Forward 1 frame" className="hover:text-black" onClick={() => videoRef.current && (videoRef.current.currentTime += 1/30)}><RotateCw className="w-4 h-4" /></button>
                           
                           <div className="relative flex items-center group/volume" onMouseEnter={() => setIsVolumeVisible(true)} onMouseLeave={() => setIsVolumeVisible(false)}>
                              <button className="h-9 w-9 flex items-center justify-center hover:bg-zinc-100 rounded-lg transition-colors">
                                {volume === 0 ? <VolumeX className="w-4 h-4" /> : volume < 0.5 ? <Volume1 className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                              </button>
                              {isVolumeVisible && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-3 z-50">
                                  <div className="bg-white p-3 rounded-2xl shadow-2xl border border-zinc-100 flex flex-col items-center gap-2 w-10 h-36">
                                     <div className="flex-1 w-1.5 bg-zinc-100 rounded-full relative overflow-hidden">
                                       <div 
                                         className="absolute bottom-0 w-full bg-zinc-900 rounded-full"
                                         style={{ height: `${volume * 100}%` }}
                                       />
                                       <input 
                                         type="range"
                                         min="0"
                                         max="1"
                                         step="0.01"
                                         value={volume}
                                         onChange={handleVolumeChange}
                                         className="absolute inset-0 w-full h-full opacity-0 cursor-pointer -rotate-90 origin-center"
                                         style={{ width: '120px', height: '30px', transform: 'rotate(-90deg) translate(-45px, 0)' }}
                                       />
                                     </div>
                                     <span className="text-[9px] font-black">{Math.round(volume * 100)}</span>
                                  </div>
                                </div>
                              )}
                           </div>
                           
                           <button className="hover:text-black" onClick={() => videoRef.current?.requestFullscreen()}><Maximize2 className="w-4 h-4" /></button>
                        </div>
                     </div>
                  </div>
                </div>

              </div>
            </motion.div>
          )}

        </AnimatePresence>

      </main>

      <BrandKitModal
        open={isBrandKitOpen}
        onClose={() => setIsBrandKitOpen(false)}
        getAuthHeaders={getAuthHeaders}
        plan={plan}
        onSaved={setBrandKit}
        notify={notify}
      />
      <TikTokPublishModal
        open={isTikTokPublishOpen}
        onClose={() => setIsTikTokPublishOpen(false)}
        downloadUrl={lastExportUrl || ''}
        defaultCaption={captions[0]?.text || ''}
        getAuthHeaders={getAuthHeaders}
        notify={notify}
      />

      {/* 8. PAYMENT MODAL (OUTSIDE MAIN FOR Z-INDEX) */}
      <AnimatePresence>
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPaymentModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col md:flex-row border border-white/20"
            >
              <div className="flex-1 p-10 border-b md:border-b-0 md:border-r border-zinc-100">
                <div className="mb-8">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-100 text-orange-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
                    Upgrade Account
                  </div>
                  <h3 className="text-3xl font-black text-zinc-900 tracking-tight leading-tight">Gói {selectedPlanForPayment}</h3>
                  <p className="text-zinc-500 text-sm mt-2 font-medium">Bắt đầu sáng tạo không giới hạn ngay hôm nay.</p>
                </div>
                
                <div className="space-y-4">
                  <div className="w-full flex items-center gap-4 p-5 rounded-3xl border-2 border-orange-500 bg-orange-50/50 relative overflow-hidden shadow-[0_8px_16px_-4px_rgba(249,115,22,0.2)]">
                    <div className="absolute top-0 right-0 px-3 py-1 bg-orange-500 text-white text-[9px] font-black uppercase tracking-widest rounded-bl-xl">Popular</div>
                    <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600 font-black shadow-inner">QR</div>
                    <div className="text-left">
                      <div className="font-black text-zinc-900 text-sm">Chuyển khoản (VietQR)</div>
                      <div className="text-[11px] text-zinc-600 font-medium italic">Vui lòng quét mã QR bên cạnh</div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-8 border-t border-zinc-100">
                  <div className="flex items-center gap-3 text-zinc-400">
                    <ShieldCheck className="w-5 h-5 text-green-500" />
                    <span className="text-[11px] font-medium">Thanh toán bảo mật & an toàn 100%</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 p-10 bg-zinc-50 flex flex-col items-center justify-center text-center">
                <div className="relative w-56 h-56 mb-8 bg-white p-3 rounded-[32px] shadow-2xl border border-zinc-200">
                  <img 
                    src="https://img.vietqr.io/image/ACB-24622041-compact.png" 
                    alt="VietQR Payment"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-white rounded-2xl shadow-lg border border-zinc-100 flex items-center justify-center">
                    <QrCode className="w-6 h-6 text-orange-500" />
                  </div>
                </div>
                
                <div className="space-y-3 mb-10 w-full">
                  <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Nội dung chuyển khoản</div>
                  <div className="bg-white border-2 border-dashed border-orange-200 text-orange-600 px-6 py-4 rounded-2xl font-mono font-black text-xl select-all cursor-copy hover:border-orange-500 transition-colors shadow-sm group" title="Click to copy">
                    SNAP {user?.email?.split('@')[0].toUpperCase()}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                    <Info className="w-3 h-3" />
                    Vui lòng nhập đúng nội dung
                  </div>
                </div>

                <button 
                  onClick={handleManualPaymentConfirm}
                  className="w-full py-5 rounded-2xl bg-zinc-900 text-white font-black hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-900/20 active:scale-95 group flex items-center justify-center gap-2"
                >
                  XÁC NHẬN ĐÃ CHUYỂN
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              <button 
                onClick={() => setIsPaymentModalOpen(false)}
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-zinc-100 transition-all z-20"
              >
                <X className="w-6 h-6 text-zinc-400" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Minimalist Components ---

function PricingFeature({ label, highlight = false }: { label: string, highlight?: boolean }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <div className={`w-1.5 h-1.5 rounded-full ${highlight ? 'bg-orange-500' : 'bg-zinc-900'}`} />
      <span className={`${highlight ? 'text-zinc-900 font-medium' : 'text-zinc-500'} font-light font-montserrat`}>{label}</span>
    </li>
  );
}

function FeatureCard({ title, desc, icon: Icon, onClick, illustration, badge }: any) {
  return (
    <motion.button 
      onClick={onClick}
      whileHover={{ y: -4 }}
      className="bg-zinc-50 p-6 rounded-[32px] text-center border border-transparent transition-all hover:border-zinc-200 hover:shadow-xl hover:shadow-zinc-100 group relative"
    >
      {badge && (
        <div className="absolute top-4 right-4 z-10 px-2 py-1 bg-zinc-900 text-white text-[10px] font-black rounded-lg uppercase tracking-widest shadow-sm">
          {badge}
        </div>
      )}
      <div className="aspect-[4/3] w-full bg-white rounded-2xl mb-6 overflow-hidden relative border border-zinc-100/50 group-hover:bg-zinc-50 transition-colors">
        {Icon && (
          <div className="absolute top-3 left-3 z-10 w-8 h-8 rounded-lg bg-white/90 border border-zinc-100 shadow-sm flex items-center justify-center">
            <Icon className="w-4 h-4 text-orange-500" />
          </div>
        )}
        {illustration}
      </div>
      <h3 className="font-montserrat font-medium text-base text-zinc-900 mb-2 truncate">{title}</h3>
      <p className="text-xs font-montserrat font-light text-zinc-400 leading-relaxed px-2">{desc}</p>
    </motion.button>
  );
}

function CaptionIllustration() {
  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <div className="flex gap-2 items-end">
        <motion.div 
          animate={{ y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="w-12 h-20 bg-zinc-100 rounded-lg border border-zinc-200 relative overflow-hidden"
        >
          <div className="absolute inset-x-2 bottom-3 h-1.5 bg-zinc-300 rounded-full" />
        </motion.div>
        <motion.div 
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2, delay: 0.5 }}
          className="w-16 h-24 bg-zinc-100 rounded-lg border border-zinc-300 relative overflow-hidden z-10"
        >
          <div className="absolute inset-x-3 bottom-4 h-2.5 bg-zinc-900 rounded-md" />
        </motion.div>
      </div>
    </div>
  );
}

function MagicCutIllustration() {
  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <div className="relative">
        <div className="flex gap-1 items-center">
           <div className="w-8 h-12 bg-zinc-100 rounded-md border border-zinc-200" />
           <div className="w-8 h-12 bg-zinc-200 rounded-md border border-zinc-300 shadow-sm" />
           <div className="w-8 h-12 bg-zinc-100 rounded-md border border-zinc-200" />
        </div>
        <motion.div 
          animate={{ x: [-10, 40, -10] }}
          transition={{ repeat: Infinity, duration: 3 }}
          className="absolute -top-4 left-0 text-zinc-900"
        >
          <Sparkles className="w-5 h-5" />
        </motion.div>
      </div>
    </div>
  );
}

function FilmIllustration() {
  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-2">
        <div className="w-16 h-10 bg-zinc-100 rounded-lg border border-zinc-200 relative">
          <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-zinc-900 rounded-full border-4 border-white shadow-sm flex items-center justify-center">
            <Plus className="w-3 h-3 text-white" />
          </div>
        </div>
        <div className="w-24 h-12 bg-zinc-50 rounded-lg border border-zinc-100" />
      </div>
    </div>
  );
}

interface BrollSuggestionItemProps {
  suggestion: BrollSuggestion;
  addedClip?: BrollClip;
  onAdd: (clip: BrollClip) => void;
  onSeek: (time: number) => void;
  getAuthHeaders: () => Promise<{ Authorization?: string }>;
  onError: (message: string) => void;
}

const BrollSuggestionItem: FC<BrollSuggestionItemProps> = ({ suggestion, addedClip, onAdd, onSeek, getAuthHeaders, onError }) => {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);

  // ... rest of searchVideos ...
  const searchVideos = async () => {
    if (results.length > 0) {
      setIsExpanding(!isExpanding);
      return;
    }
    setLoading(true);
    setIsExpanding(true);
    try {
      const res = await fetch(`/api/pexels/search?query=${encodeURIComponent(suggestion.keyword)}&per_page=4`, {
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Lỗi tìm kiếm video");
      }

      setResults(data.videos || []);
    } catch (err: any) {
      console.error(err);
      onError("Không thể tải video gợi ý lúc này. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rounded-2xl border transition-all duration-300 ${addedClip ? 'bg-orange-50/50 border-orange-200' : 'bg-zinc-50 border-zinc-100 overflow-hidden'}`}>
      <div className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div 
            onClick={() => onSeek(suggestion.timestamp)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0 cursor-pointer transition-colors ${addedClip ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-zinc-900 text-white hover:bg-zinc-800'}`}
          >
            {suggestion.timestamp}s
          </div>
          <div className="min-w-0">
            <p className={`text-[10px] font-black uppercase tracking-widest leading-none mb-1 ${addedClip ? 'text-orange-400' : 'text-zinc-400'}`}>Visual Keyword</p>
            <h4 className="text-xs font-bold text-zinc-900 truncate tracking-tight uppercase italic">{suggestion.keyword}</h4>
            {(suggestion.score || suggestion.reason) && (
              <p className="text-[10px] text-zinc-500 mt-1 truncate">
                {suggestion.score ? `Score ${Math.round(suggestion.score)}.` : ''} {suggestion.reason || ''}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {addedClip && (
            <div className="w-10 h-10 rounded-lg overflow-hidden border border-orange-200 shadow-sm shrink-0 relative bg-black flex items-center justify-center">
              <img src={addedClip.previewUrl} className="w-full h-full object-cover opacity-80" />
              <Check className="absolute w-4 h-4 text-white drop-shadow-md" />
            </div>
          )}
          <button 
            onClick={searchVideos}
            className={`shrink-0 p-2 rounded-xl transition-all ${isExpanding ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-400 hover:text-zinc-900 border border-zinc-100 shadow-sm'}`}
          >
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full"/> : (addedClip ? <Replace className="w-4 h-4" /> : <Search className="w-4 h-4" />)}
          </button>
        </div>
      </div>
      
      <AnimatePresence>
        {isExpanding && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-4 overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-2 mt-2">
              {results.map((video: any) => (
                <div 
                  key={video.id}
                  className="group relative aspect-[9/16] bg-zinc-200 rounded-xl overflow-hidden border border-zinc-100 cursor-pointer"
                  onClick={() => {
                    const videoFile = video.video_files.find((f: any) => f.quality === 'hd' || f.quality === 'sd');
                    onAdd({
                      id: String(video.id),
                      timestamp: suggestion.timestamp,
                      keyword: suggestion.keyword,
                      videoUrl: videoFile?.link || video.video_files[0].link,
                      previewUrl: video.image,
                      duration: Math.max(1.2, Math.min(4, Number(suggestion.duration || 3)))
                    });
                    setIsExpanding(false);
                  }}
                >
                  <img src={video.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                    <Plus className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-all scale-50 group-hover:scale-100" />
                  </div>
                </div>
              ))}
              {results.length === 0 && !loading && (
                <div className="col-span-2 py-8 text-center text-[10px] font-bold text-zinc-400 uppercase">
                  No footage found
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarItem({ icon: Icon, label, active = false, badge, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center transition-all duration-200 group ${label ? 'gap-3 px-3 py-2.5' : 'justify-center p-2.5'} rounded-xl ${active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-zinc-100'}`}
    >
      <Icon className={`w-4 h-4 transition-colors ${active ? 'text-zinc-900' : 'text-zinc-500 group-hover:text-zinc-900'}`} />
      {label && <span className={`text-[13px] font-medium tracking-tight whitespace-nowrap transition-colors ${active ? 'text-zinc-900' : 'text-zinc-700 group-hover:text-zinc-900'}`}>{label}</span>}
      {label && badge && <span className="ml-auto text-[9px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded-md font-bold tracking-tighter uppercase border border-zinc-200">{badge}</span>}
    </button>
  );
}

function UploadOption({ icon: Icon, label, primary = false, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-5 p-6 rounded-[32px] transition-all font-black text-lg ${primary ? 'bg-zinc-900 text-white shadow-xl shadow-zinc-100 ring-4 ring-zinc-900/5' : 'bg-zinc-50 text-zinc-900 hover:bg-zinc-100 border border-zinc-100'}`}
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${primary ? 'bg-white/10' : 'bg-white border border-zinc-100 shadow-sm'}`}>
        <Icon className="w-6 h-6" />
      </div>
      <span className="flex-1 text-left tracking-tight">{label}</span>
      <ChevronRight className="w-5 h-5 opacity-20" />
    </button>
  );
}

function ConfigToggle({ label, icon: Icon, info }: any) {
  const [enabled, setEnabled] = useState(false);
  return (
    <div 
      onClick={() => setEnabled(!enabled)}
      className={`p-6 rounded-[32px] border transition-all cursor-pointer flex items-center gap-5 ${enabled ? 'bg-zinc-900 text-white border-zinc-900 shadow-xl' : 'bg-white border-zinc-100 hover:bg-zinc-50'}`}
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${enabled ? 'bg-white/10' : 'bg-zinc-50 text-zinc-400'}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
         <h4 className="font-bold text-sm">{label}</h4>
         <p className={`text-[10px] font-medium opacity-50 ${enabled ? 'text-white' : 'text-zinc-500'}`}>{info}</p>
      </div>
      <div className={`w-12 h-7 rounded-full relative transition-all border ${enabled ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-100 border-zinc-200'}`}>
         <div className={`absolute top-1 w-5 h-5 rounded-full transition-all shadow-md ${enabled ? 'left-6 bg-white' : 'left-1 bg-zinc-400'}`} />
      </div>
    </div>
  );
}

function ProcessingStepSubmagic({ complete, active, label }: any) {
  return (
    <div className="flex items-center gap-4">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${complete ? 'bg-orange-500 border-orange-500' : 'border-zinc-200'}`}>
        {complete ? (
          <Check className="w-3 h-3 text-white stroke-[4]" />
        ) : (
          <div className={`w-full h-full rounded-full ${active ? 'border-t-orange-500 animate-spin border-transparent border-2' : ''}`} />
        )}
      </div>
      <span className={`text-base font-bold transition-all ${complete ? 'text-zinc-900' : active ? 'text-orange-500' : 'text-zinc-300'}`}>{label}</span>
      {active && <span className="text-orange-500 italic ml-auto animate-pulse">Processing...</span>}
    </div>
  );
}

function ProcessingStep({ active, complete, label }: any) {
  return (
    <div className={`flex items-center gap-5 transition-all duration-1000 ${complete || active ? 'opacity-100' : 'opacity-20'}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${complete ? 'bg-zinc-900 border-zinc-900' : active ? 'border-zinc-900' : 'border-zinc-100'}`}>
        {complete ? <Check className="w-3 h-3 text-white" /> : active && <div className="w-1.5 h-1.5 bg-zinc-900 rounded-full" />}
      </div>
      <span className={`text-xs font-black tracking-tight uppercase ${complete ? 'text-zinc-400' : 'text-zinc-900'}`}>{label}</span>
    </div>
  );
}

function TabButton({ icon: Icon, label, active, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all shrink-0 ${active ? 'bg-zinc-900 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function StylePreview({ name, class: cls, previewClass, active, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`group relative h-20 rounded-[20px] overflow-hidden border-2 transition-all p-3 flex items-center justify-center text-center ${active ? 'border-zinc-900 ring-4 ring-zinc-900/5' : 'border-zinc-100 hover:border-zinc-200'} ${previewClass}`}
    >
      <div className="w-full h-full flex items-center justify-center transform group-hover:scale-105 transition-transform" style={{ transform: 'scale(0.55)' }}>
         <span className={`${cls} !whitespace-nowrap`} style={{ animation: 'none' }}>{name}</span>
      </div>
      {active && <div className="absolute top-2 right-2 w-4 h-4 bg-zinc-900 rounded-full flex items-center justify-center shadow-lg"><Check className="w-2.5 h-2.5 text-white stroke-[4]" /></div>}
    </button>
  );
}

function CaptionRow({ start, end, text, active = false, emoji, onEdit, onSeek, onPausePreview, brolls = [], onRemoveBroll, zooms = [], onRemoveZoom, transitions = [], onRemoveTransition, onAddZoomClick, onAddTransitionClick, onAddBrollClick }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(text);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => { setVal(text); }, [text]);

  const formatZoomLabel = (type: string) => {
    return type.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  };

  const timestampLabel = `${Number(start || 0).toFixed(2)} - ${Number(end || start || 0).toFixed(2)}`;

  return (
    <div className={`p-6 rounded-[2rem] transition-all flex flex-col gap-4 border relative ${active ? 'bg-zinc-50 border-orange-200 shadow-sm' : 'bg-white border-zinc-100 hover:border-zinc-200'}`} onClick={() => onSeek && onSeek(start)}>
      
      <div className="flex justify-between items-center">
        <button 
          onClick={(e) => { e.stopPropagation(); onSeek && onSeek(start); }}
          className={`px-3 py-1 text-[10px] uppercase font-black tracking-widest rounded-full font-mono transition-colors ${active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
          title="Play from here"
        >
          {timestampLabel}
        </button>
        {active && <motion.div layoutId="active-dot" className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.6)]" />}
      </div>

      {/* Main content: Transcript text */}
      <div className="flex items-center gap-2">
         {isEditing ? (
           <textarea 
             autoFocus
             value={val}
             onChange={(e) => setVal(e.target.value)}
             onBlur={() => { setIsEditing(false); if(val !== text) onEdit(val); }}
             onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.target as any).blur()}
             className="bg-zinc-100 text-zinc-900 border-none rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-bold text-[16px] w-full min-h-[70px] shadow-inner"
           />
         ) : (
           <span 
             onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
             className={`text-[17px] font-semibold tracking-tight leading-snug cursor-text ${active ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
             title="Click to edit"
           >
             {text} {emoji}
           </span>
         )}
      </div>

      {/* Bottom Actions Row */}
      <div className="flex items-center gap-2 flex-wrap mt-1">
         
         {/* Render Attached Brolls */}
         {brolls && brolls.map((b: any) => (
            <div key={b.id} className="flex items-center bg-purple-50 border border-purple-100 rounded-xl p-1 pr-3 gap-2 shrink-0 group animate-in zoom-in-50 duration-300">
               <div className="w-8 h-8 rounded-lg overflow-hidden bg-purple-200 flex items-center justify-center relative">
                   {b.previewUrl && <img src={b.previewUrl} className="w-full h-full object-cover" />}
                   <Video className="w-3.5 h-3.5 text-purple-600 absolute" />
               </div>
               <span className="text-[10px] font-black text-purple-700 uppercase tracking-tighter">🎬 {b.keyword}</span>
               <button onClick={(e) => { e.stopPropagation(); onRemoveBroll && onRemoveBroll(b.id); }} className="ml-1 p-1 hover:bg-purple-200 rounded-full transition-colors">
                  <X className="w-3 h-3 text-purple-500" />
               </button>
            </div>
         ))}
         
         {/* Render Attached Zooms */}
         {zooms && zooms.map((z: any) => (
            <div key={z.id} className="flex items-center bg-blue-50 border border-blue-100 rounded-xl p-1 pr-3 gap-2 shrink-0 group animate-in zoom-in-50 duration-300">
               <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                   <Search className="w-4 h-4 text-blue-600" />
               </div>
               <span className="text-[10px] font-black text-blue-700 uppercase tracking-tighter">🔍 {formatZoomLabel(z.type).toUpperCase()}</span>
               <button onClick={(e) => { e.stopPropagation(); onRemoveZoom && onRemoveZoom(z.id); }} className="ml-1 p-1 hover:bg-blue-200 rounded-full transition-colors">
                  <X className="w-3 h-3 text-blue-500" />
               </button>
            </div>
         ))}

         {transitions && transitions.map((t: any, idx: number) => (
            <div key={`${t.type}_${idx}`} className="flex items-center bg-amber-50 border border-amber-100 rounded-xl p-1 pr-3 gap-2 shrink-0 group animate-in zoom-in-50 duration-300">
               <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                   <Replace className="w-4 h-4 text-amber-700" />
               </div>
               <span className="text-[10px] font-black text-amber-700 uppercase tracking-tighter">✨ {String(t.type || '').replaceAll('_', ' ')}</span>
               <button onClick={(e) => { e.stopPropagation(); onRemoveTransition && onRemoveTransition(); }} className="ml-1 p-1 hover:bg-amber-200 rounded-full transition-colors">
                  <X className="w-3 h-3 text-amber-600" />
               </button>
            </div>
         ))}
         
         {/* action button */}
         <div className="relative">
           <button 
            onClick={(e) => {
              e.stopPropagation();
              onPausePreview && onPausePreview();
              setIsDropdownOpen(!isDropdownOpen);
            }}
            onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
            className="w-8 h-8 rounded-lg border border-zinc-200 flex items-center justify-center hover:bg-zinc-50 transition-colors text-zinc-500 hover:text-zinc-900 bg-white shadow-sm"
           >
             <Plus className="w-4 h-4" />
           </button>
           
           {/* Dropdown Menu */}
           {isDropdownOpen && (
             <div onClick={(e) => e.stopPropagation()} className="absolute top-full left-0 mt-1 w-48 bg-white border border-zinc-100 rounded-xl shadow-xl z-50 overflow-hidden text-[13px] py-1 animate-in fade-in slide-in-from-top-2">
               <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-3 py-2">Effects</div>
               <button
                 onClick={() => {
                   setIsDropdownOpen(false);
                   onPausePreview && onPausePreview();
                   onAddBrollClick && onAddBrollClick();
                 }}
                 className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 text-left text-zinc-700 font-medium transition-colors"
               >
                 <Film className="w-4 h-4" /> B-roll
               </button>
               <button 
                 onClick={() => {
                   setIsDropdownOpen(false);
                   onPausePreview && onPausePreview();
                   onAddZoomClick && onAddZoomClick();
                 }}
                 className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 text-left text-zinc-700 font-medium transition-colors"
               >
                 <ZoomIn className="w-4 h-4" /> Zoom
               </button>
               <button
                 onClick={() => {
                   setIsDropdownOpen(false);
                   onPausePreview && onPausePreview();
                   onAddTransitionClick && onAddTransitionClick();
                 }}
                 className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 text-left text-zinc-700 font-medium transition-colors"
               >
                 <Replace className="w-4 h-4" /> Transition
               </button>
             </div>
           )}
         </div>
      </div>
    </div>
  );
}

function SceneThumbnail({ title, duration, img, badge, active = false }: any) {
  return (
    <div className={`p-4 rounded-[32px] border transition-all duration-300 cursor-pointer ${active ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-100'}`}>
      <div className="flex gap-4 items-center">
        <div className="w-20 h-24 rounded-2xl overflow-hidden grayscale">
          <img src={img} className="w-full h-full object-cover" />
        </div>
        <div>
          {badge && <span className="inline-block text-[8px] font-black px-2 py-0.5 bg-white text-zinc-900 rounded-full mb-2 tracking-widest">{badge}</span>}
          <h4 className="font-black text-xs">{title}</h4>
          <p className="text-[10px] font-medium opacity-40 mt-1">{duration}</p>
        </div>
      </div>
    </div>
  );
}
