import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Sparkles, HelpCircle, LayoutGrid, Layers, Settings, Aperture } from 'lucide-react';

export const SnapMotionGraphic = ({ activeCaption, currentTime, captions }: { activeCaption: any, currentTime: number, captions: any[] }) => {
  if (!activeCaption) return null;

  const text = activeCaption.text || "";
  
  // 1. Semantic Scene Selection & 2. Breathing Room & Scene Persistence Logic
  const scenesMap = useMemo(() => {
    const result: Record<string, number> = {};
    let lastHeavyTime = -999;
    let currentHeavyScene = { type: 0, expiresAt: 0 };
    let hasUsedHook = false;
    
    // Process captions chronologically
    const sortedCaptions = [...captions].sort((a, b) => a.start - b.start);
    
    sortedCaptions.forEach((cap, index) => {
      let type = 0; // Default: Simple Text (Base)
      const t = cap.text.toLowerCase();
      
      // If we are currently in a persistent heavy scene, continue it
      if (currentHeavyScene.type !== 0 && cap.start < currentHeavyScene.expiresAt) {
        type = currentHeavyScene.type;
      } else {
        // Enforce 4 seconds of breathing room after a heavy scene ends
        if (cap.start - lastHeavyTime < 5) {
          type = 0; // Force Simple Text
        } else {
          // Rule: 1 Hook at the beginning
          if (cap.start < 3 && !hasUsedHook && /(quan trọng|duy nhất|không thể|tuyệt đối|đặc biệt|sứ mệnh|thriving|bí mật|cách|hướng dẫn)/i.test(t)) {
            type = 1; // Special Glow Text (Hook)
            hasUsedHook = true;
          } 
          // Keyword NLP matching with English + Vietnamese supports
          else if (/(bước|layer|quy trình|hướng dẫn|nhiều|tiếp theo|cấp độ|step|process|guide|next|level|thứ hai|thứ ba)/i.test(t)) {
            type = 4; // UI Stack
          } else if (/(kiến thức|tham khảo|nguồn|sách|học|chia sẻ|vault|kho|lưu trữ|bảo mật|cộng đồng|learn|book|share|knowledge)/i.test(t)) {
            type = 3; // Vault / Inspiration
          } else if (/(vấn đề|bí mật|công cụ|lý do|phương pháp|nguyên nhân|problem|secret|tool|reason|method|tại sao)/i.test(t)) {
            type = 2; // UI Cards
          } else if (!hasUsedHook && index < 2) {
            // Force hook on first or second caption if not matched
            type = 1;
            hasUsedHook = true;
          }
          
          if (type !== 0) {
            // Start a new persistent scene
            currentHeavyScene = {
              type,
              expiresAt: cap.start + 2.5 // Persist for at least 2.5 seconds
            };
          }
        }
      }
      
      // Update lastHeavyTime if we are in a heavy scene
      if (type !== 0) {
         // The end time is either the natural expiration or the end of a long caption
         lastHeavyTime = Math.max(currentHeavyScene.expiresAt, cap.end);
      } else {
         // If it's a simple text, currentHeavyScene clears out
         currentHeavyScene = { type: 0, expiresAt: 0 };
      }
      
      result[cap.id] = type;
    });
    return result;
  }, [captions]);

  const scene = scenesMap[activeCaption.id] || 0;

  const words = text.split(" ");
  // Find longest word to be the "Highlight" for Scene 1
  const highlightIndex = useMemo(() => {
    let maxIdx = 0;
    let maxLen = 0;
    words.forEach((w: string, i: number) => {
      const cleanW = w.replace(/[.,!?]/g, "");
      if (cleanW.length > maxLen) {
        maxLen = cleanW.length;
        maxIdx = i;
      }
    });
    return maxIdx;
  }, [words]);

  // Standard animation timings
  const animIn = { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] };
  const animOut = { duration: 0.25, ease: [0.55, 0.085, 0.68, 0.53] };

  return (
    <div className="absolute inset-0 z-50 w-full h-full pointer-events-none flex flex-col overflow-hidden">
      
      {/* 3. Safe Zone: Background dimming for lower third ONLY */}
      <div className="absolute bottom-0 w-full h-[45%] bg-gradient-to-t from-black/90 via-black/40 to-transparent z-0" />

      {/* Graphics Container (Middle-Lower, avoids covering face) */}
      <div className="relative flex-1 w-full flex flex-col items-center justify-end z-10 px-4 sm:px-8 pb-[25%] sm:pb-[20%]">
        <AnimatePresence mode="popLayout">
          
          {/* SCENE 2: 3 UI Reel Cards + Icons */}
          {scene === 2 && (
            <motion.div
              key="s2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, filter: "blur(10px)", scale: 0.9, ...animOut }}
              transition={{ duration: 0.5 }}
              className="absolute flex items-center justify-center gap-4 sm:gap-6 scale-75 sm:scale-90"
            >
              {[0, 1, 2].map((i) => {
                const colors = ['from-[#0055ff]/40', 'from-[#9000ff]/40', 'from-[#00ff88]/40'];
                const glowColors = ['bg-[#00e5ff]', 'bg-[#d000ff]', 'bg-[#00ff88]'];
                return (
                  <motion.div
                    key={i}
                    initial={{ y: 80, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.15, type: "spring", stiffness: 100, damping: 15 }}
                    className="relative flex flex-col items-center"
                  >
                    {/* Circle Icon above card */}
                    <motion.div 
                      initial={{ scale: 0, y: 20 }}
                      animate={{ scale: 1, y: 0 }}
                      transition={{ delay: 0.5 + i * 0.1, type: "spring" }}
                      className={`absolute -top-10 w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shadow-[0_8px_16px_rgba(0,0,0,0.5)] z-20 overflow-hidden bg-gradient-to-tr ${colors[i]} to-[#222] border-[2px] border-white/20`}
                    >
                      <HelpCircle className="w-6 h-6 sm:w-8 sm:h-8 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                      <div className="absolute inset-0 backdrop-blur-md bg-black/20" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '4px 4px' }} />
                    </motion.div>

                    {/* Reel Card */}
                    <div className="w-28 h-48 sm:w-36 sm:h-64 rounded-[1.5rem] bg-[#111] border-[1px] border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.9)] relative overflow-hidden flex items-center justify-center">
                      <div className={`absolute w-full h-full bg-gradient-to-b ${colors[i]} to-black/90`} />
                      <div className="absolute inset-0 grid grid-cols-4 grid-rows-8 opacity-20">
                         {Array.from({length: 32}).map((_, idx) => (
                           <div key={idx} className="bg-white/20 m-[1px] rounded-sm" style={{ opacity: Math.random() }} />
                         ))}
                      </div>
                      <div className="absolute inset-0 rounded-[1.5rem] border-[2px] border-white opacity-20" style={{ maskImage: 'linear-gradient(to bottom, black 20%, transparent 80%)', WebkitMaskImage: 'linear-gradient(to bottom, black 20%, transparent 80%)' }} />
                      <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-16 h-8 ${glowColors[i]} blur-[20px] mix-blend-screen opacity-50`} />
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}

          {/* SCENE 3: Two UI Pop-up Panels */}
          {scene === 3 && (
            <motion.div
              key="s3"
              className="absolute flex items-center justify-center gap-4 sm:gap-10 scale-75 sm:scale-90"
            >
              {/* Panel 1 (Vault/Blue) */}
              <motion.div
                initial={{ y: 60, rotate: -5, opacity: 0 }}
                animate={{ y: 0, rotate: -2, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0, ...animOut }}
                transition={{ type: "spring", damping: 15, stiffness: 120 }}
                className="relative flex flex-col items-center"
              >
                <div className="w-40 h-40 sm:w-52 sm:h-52 rounded-[2rem] p-1 bg-gradient-to-br from-[#1a2b4c] to-[#050a12] shadow-[0_20px_40px_rgba(0,0,0,0.95)] relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,100,255,0.4),transparent_70%)]" />
                  <div className="absolute top-0 left-0 w-[150%] h-1 bg-white opacity-40 blur-[2px] rotate-45 transform origin-top-left" />
                  <div className="w-full h-full rounded-[1.8rem] border border-[#ffffff15] bg-[#00000060] backdrop-blur-xl flex flex-col items-center justify-center relative z-10">
                    <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="relative">
                      <div className="absolute inset-0 bg-[#00e5ff] blur-[30px] opacity-40" />
                      <Shield className="w-12 h-12 sm:w-14 sm:h-14 text-[#00e5ff] fill-[#0088ff] drop-shadow-[0_0_15px_#00e5ff]" strokeWidth={1} />
                    </motion.div>
                  </div>
                </div>
                <motion.div 
                  initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                  className="mt-4 text-lg sm:text-xl text-[#00e5ff] font-light italic tracking-widest drop-shadow-[0_0_10px_#00e5ff]"
                >
                  vault
                </motion.div>
              </motion.div>

              {/* Panel 2 (Book/Idea/Purple) */}
              <motion.div
                initial={{ y: 60, rotate: 5, opacity: 0 }}
                animate={{ y: 0, rotate: 2, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0, ...animOut }}
                transition={{ delay: 0.15, type: "spring", damping: 15, stiffness: 120 }}
                className="relative flex flex-col items-center mt-8 sm:mt-12"
              >
                <div className="w-40 h-40 sm:w-52 sm:h-52 rounded-[2rem] p-1 bg-gradient-to-br from-[#3b1a4c] to-[#12051a] shadow-[0_20px_40px_rgba(0,0,0,0.95)] relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(180,0,255,0.4),transparent_70%)]" />
                  <div className="w-full h-full rounded-[1.8rem] border border-[#ffffff15] bg-[#00000060] backdrop-blur-xl flex flex-col items-center justify-center relative z-10">
                    <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ delay: 1, duration: 2, repeat: Infinity, ease: "easeInOut" }} className="relative">
                      <div className="absolute inset-0 bg-[#d000ff] blur-[30px] opacity-40" />
                      <Sparkles className="w-12 h-12 sm:w-14 sm:h-14 text-[#e5aaff] fill-[#9000ff] drop-shadow-[0_0_15px_#d000ff]" strokeWidth={1} />
                    </motion.div>
                  </div>
                </div>
                <motion.div 
                  initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }}
                  className="mt-4 text-lg sm:text-xl text-[#d000ff] font-light italic tracking-widest drop-shadow-[0_0_10px_#d000ff]"
                >
                  inspiration
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {/* SCENE 4: Multi-layer UI Stack */}
          {scene === 4 && (
            <motion.div
              key="s4"
              className="absolute flex flex-col items-center justify-center scale-90 sm:scale-100"
              exit={{ opacity: 0, y: -20, ...animOut }}
            >
              <div className="flex flex-col relative w-64 sm:w-80" style={{ perspective: '1000px' }}>
                {['Vignette', 'Blur', 'Aberration', 'Noise', 'Posterize'].map((item, idx) => {
                  const isHighlighted = idx === 2;
                  return (
                    <motion.div
                      key={item}
                      initial={{ y: 50, opacity: 0, scale: 0.9, rotateX: 10 }}
                      animate={{ 
                        y: idx * -15, 
                        opacity: 1,
                        scale: isHighlighted ? 1.05 : 1,
                        rotateX: 0,
                        backgroundColor: isHighlighted ? 'rgba(80, 10, 10, 0.9)' : 'rgba(20, 20, 20, 0.8)',
                        borderColor: isHighlighted ? '#ff4444' : '#444'
                      }}
                      transition={{ 
                        delay: idx * 0.1, 
                        type: "spring", stiffness: 200, damping: 20,
                        backgroundColor: { delay: isHighlighted ? 0.8 : 0, duration: 0.3 }
                      }}
                      style={{ zIndex: 10 - idx }}
                      className={`relative w-full h-16 sm:h-20 rounded-2xl border-[2px] backdrop-blur-xl shadow-[0_15px_30px_rgba(0,0,0,0.9)] flex items-center justify-between px-4 sm:px-6 -mt-8 sm:-mt-10 first:mt-0 ${isHighlighted ? 'shadow-[0_0_40px_rgba(255,68,68,0.6)]' : ''}`}
                    >
                      {isHighlighted && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="absolute inset-0 rounded-xl bg-red-500 opacity-20 blur-xl mix-blend-screen pointer-events-none" />
                      )}
                      <span className={`text-lg sm:text-xl font-black uppercase tracking-wider ${isHighlighted ? 'text-white drop-shadow-[0_0_5px_rgba(255,68,68,0.8)]' : 'text-gray-400'}`}>
                        {item}
                      </span>
                      <div className={`p-1.5 sm:p-2 rounded-xl border border-white/10 ${isHighlighted ? 'bg-[#ff4444] shadow-[0_0_15px_#ff4444]' : 'bg-gray-800'}`}>
                        {idx === 0 ? <Aperture className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> :
                         idx === 1 ? <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> :
                         idx === 2 ? <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> :
                         idx === 3 ? <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> :
                                     <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* TEXT RENDERER (Absolute Bottom: 75-85% Canvas Height approx) */}
      <div className="absolute bottom-[8%] sm:bottom-[10%] w-full flex justify-center z-50 px-4">
        <AnimatePresence mode="wait">
          {scene === 1 ? (
            /* SCENE 1: Special Glow Text (Hook) */
            <motion.div
              key={`text-s1-${activeCaption.id}`}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0, ...animOut }}
              transition={animIn}
              className="flex flex-wrap justify-center items-center gap-x-2 sm:gap-x-3 gap-y-1 sm:gap-y-2 text-center max-w-4xl"
            >
              {words.map((word: string, idx: number) => {
                const isHighlight = idx === highlightIndex;
                if (isHighlight) {
                  return (
                    <div key={idx} className="relative inline-block">
                      <div className="absolute inset-0 bg-[#00e5ff] blur-2xl opacity-40 mix-blend-screen pointer-events-none" />
                      <motion.span
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.1 * idx, type: "spring" }}
                        className="relative uppercase font-black text-4xl sm:text-5xl md:text-7xl italic px-1 z-10 inline-block overflow-hidden"
                        style={{
                          fontFamily: "'Montserrat', sans-serif",
                          fontWeight: 900,
                          background: 'linear-gradient(90deg, #0055ff, #00e5ff)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          filter: 'drop-shadow(0px 8px 12px rgba(0,0,0,0.9))'
                        }}
                      >
                        <span className="relative z-10">{word}</span>
                        <motion.div 
                          initial={{ left: "-100%" }}
                          animate={{ left: "200%" }}
                          transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                          className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-white to-transparent opacity-80 skew-x-[-20deg] mix-blend-overlay z-20"
                        />
                      </motion.span>
                    </div>
                  );
                }
                return (
                  <motion.span
                    key={idx}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.05 * idx, type: "spring" }}
                    className="relative uppercase font-extrabold text-3xl sm:text-4xl md:text-6xl tracking-tight z-10"
                    style={{
                      fontFamily: "'Montserrat', sans-serif",
                      fontWeight: 800,
                      background: 'linear-gradient(180deg, #ffffff, #aaaaaa)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      filter: 'drop-shadow(0px 6px 10px rgba(0,0,0,0.8))'
                    }}
                  >
                    {word}
                  </motion.span>
                );
              })}
            </motion.div>
          ) : (
            /* SIMPLE TEXT BASE (Scenes 0, 2, 3, 4 - ~70% time) */
            <motion.div
              key={`text-s0-${activeCaption.id}`}
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0, ...animOut }}
              transition={animIn}
              className="text-center w-full"
            >
              <span 
                className="uppercase font-black text-[2.5rem] leading-none sm:text-5xl md:text-6xl tracking-tight inline-block px-4 py-2"
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 900,
                  background: 'linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0px 6px 10px rgba(0,0,0,0.9))',
                  WebkitTextStroke: '2px rgba(0,0,0,0.8)'
                }}
              >
                {text}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
};

