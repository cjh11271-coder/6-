/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Send, User, Bot, RefreshCcw, Info, CheckCircle2, AlertCircle, MessageSquare, Save, History, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

enum DebateStage {
  INIT = 'INIT', // 주제 및 입장 정하기
  OPENING = 'OPENING', // 주장 펼치기
  REBUTTAL = 'REBUTTAL', // 반론하기
  CLOSING = 'CLOSING', // 주장 다지기
  JUDGMENT = 'JUDGMENT', // 판정하기
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface SavedDebate {
  id: string;
  date: string;
  topic: string;
  messages: Message[];
  stage: DebateStage;
}

// --- Constants ---

const SYSTEM_INSTRUCTION = `
당신은 초등학교 6학년 학생들의 토론 연습을 도와주는 '토론 메이트'입니다. 
초등학교 6학년 국어 '절차를 지키며 토론해요' 단원의 학습 목표를 충실히 따릅니다.

[토론 절차]
1. [주장 펼치기]: 주장, 이유, 근거 제시.
2. [반론하기]: 상대측 주장/이유/근거의 허점 지적 및 반론에 대한 답변.
3. [주장 다지기]: 주장과 근거 정리, 입장 강조, 상대 반론 반영하여 타당성 높이기.
4. [판정하기]: 전체적인 토론 내용 평가.

[당신의 역할]
- 학생이 찬성 측이면 당신은 반대 측, 학생이 반대 측이면 당신은 찬성 측이 되어 토론합니다.
- 학생의 근거를 '관련성', '신뢰성', '충분성' 측면에서 평가(◎, ○, △)하고 **매우 구체적이고 상세한 피드백**을 줍니다.
  * 관련성: 근거가 주장이나 이유와 얼마나 직접적으로 연결되는지 설명.
  * 신뢰성: 출처의 객관성, 수치의 정확성, 전문가의 의견인지 등을 구체적으로 언급.
  * 충분성: 주장을 뒷받침하기에 정보의 양이 적절한지, 더 필요한 정보는 무엇인지 제안.
- 학생이 토론 예절(높임말, 주제 관련성, 존중, 말차례)을 지키는지 확인하고, 지키지 않으면 정중하게 지적합니다.
- 초등학생 수준에 맞는 어휘와 문장을 사용하되, 논리적이어야 합니다.
- **응답이 길어지거나 복잡할 경우, 초등학생이 이해하기 쉽게 핵심 내용을 요약하거나 강조하여 전달하세요.**

[응답 형식]
- 대화의 흐름에 따라 현재 단계를 명시하고 토론을 진행하세요.
- 평가가 필요한 단계에서는 반드시 ◎, ○, △ 기호를 사용하여 평가 결과를 포함하세요.
- **중요한 내용은 볼트체(**)를 사용하거나 글머리 기호를 활용하여 한눈에 들어오게 하세요.**
- 친절하고 격려하는 말투를 유지하세요.
`;

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [stage, setStage] = useState<DebateStage>(DebateStage.INIT);
  const [isLoading, setIsLoading] = useState(false);
  const [savedDebates, setSavedDebates] = useState<SavedDebate[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize AI
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  // --- Effects ---

  useEffect(() => {
    // Load saved debates from localStorage
    const saved = localStorage.getItem('debate_history');
    if (saved) {
      setSavedDebates(JSON.parse(saved));
    }

    // 초기 메시지
    if (messages.length === 0) {
      setMessages([
        {
          role: 'model',
          text: '안녕! 나는 너의 토론 연습을 도와줄 토론 메이트야. 오늘 어떤 주제로 토론해보고 싶니? 그리고 너의 입장은 찬성인지 반대인지도 알려줘!'
        }
      ]);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // --- Handlers ---

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Create history for chat
      const history = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      const chat = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
          systemInstruction: SYSTEM_INSTRUCTION
        },
        history: history as any
      });

      const result = await chat.sendMessage({ message: input });
      const responseText = result.text || '미안해, 응답을 가져오지 못했어.';

      // 단계 추론
      if (stage === DebateStage.INIT) {
        if (input.length > 5) setStage(DebateStage.OPENING);
      } else if (responseText.includes('[반론하기]')) {
        setStage(DebateStage.REBUTTAL);
      } else if (responseText.includes('[주장 다지기]')) {
        setStage(DebateStage.CLOSING);
      } else if (responseText.includes('[판정하기]')) {
        setStage(DebateStage.JUDGMENT);
      }

      setMessages(prev => [...prev, { role: 'model', text: responseText }]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { role: 'model', text: '미안해, 오류가 발생했어. 다시 한번 말해줄래?' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const resetDebate = () => {
    setMessages([
      {
        role: 'model',
        text: '안녕! 다시 시작해보자. 오늘 어떤 주제로 토론해보고 싶니? 그리고 너의 입장은 찬성인지 반대인지도 알려줘!'
      }
    ]);
    setStage(DebateStage.INIT);
  };

  const saveDebate = () => {
    if (messages.length <= 1) return;
    
    const topic = messages.find(m => m.role === 'user')?.text.substring(0, 20) || '새 토론';
    const newSave: SavedDebate = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      topic: topic,
      messages: messages,
      stage: stage
    };

    const updated = [newSave, ...savedDebates];
    setSavedDebates(updated);
    localStorage.setItem('debate_history', JSON.stringify(updated));
    alert('토론 기록이 저장되었습니다!');
  };

  const loadDebate = (debate: SavedDebate) => {
    setMessages(debate.messages);
    setStage(debate.stage);
    setShowHistory(false);
  };

  const deleteDebate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedDebates.filter(d => d.id !== id);
    setSavedDebates(updated);
    localStorage.setItem('debate_history', JSON.stringify(updated));
  };

  // --- Render Helpers ---

  const getStageLabel = (s: DebateStage) => {
    switch (s) {
      case DebateStage.INIT: return '주제 및 입장 정하기';
      case DebateStage.OPENING: return '주장 펼치기';
      case DebateStage.REBUTTAL: return '반론하기';
      case DebateStage.CLOSING: return '주장 다지기';
      case DebateStage.JUDGMENT: return '판정하기';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <MessageSquare className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">초등 토론 연습 메이트</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">6학년 국어: 절차를 지키며 토론해요</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
              title="토론 기록"
            >
              <History className="w-5 h-5" />
            </button>
            <button 
              onClick={saveDebate}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
              title="저장하기"
            >
              <Save className="w-5 h-5" />
            </button>
            <button 
              onClick={resetDebate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
            >
              <RefreshCcw className="w-4 h-4" />
              다시 시작
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto flex flex-col p-4 md:p-6 gap-6 overflow-hidden relative">
        
        {/* History Sidebar/Overlay */}
        <AnimatePresence>
          {showHistory && (
            <motion.div 
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              className="absolute right-4 top-4 bottom-4 w-80 bg-white shadow-2xl rounded-2xl z-20 border border-slate-200 flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                  <History className="w-4 h-4" /> 이전 토론 기록
                </h3>
                <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {savedDebates.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-10">저장된 기록이 없습니다.</p>
                ) : (
                  savedDebates.map(d => (
                    <div 
                      key={d.id} 
                      onClick={() => loadDebate(d)}
                      className="p-3 border border-slate-100 rounded-xl hover:bg-indigo-50 cursor-pointer transition-colors group relative"
                    >
                      <p className="text-sm font-bold text-slate-700 truncate pr-6">{d.topic}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{d.date}</p>
                      <button 
                        onClick={(e) => deleteDebate(d.id, e)}
                        className="absolute right-2 top-2 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress Bar */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-semibold text-indigo-600">{getStageLabel(stage)}</span>
            <span className="text-xs text-slate-400">단계 {Object.values(DebateStage).indexOf(stage) + 1} / 5</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <motion.div 
              className="bg-indigo-500 h-full"
              initial={{ width: 0 }}
              animate={{ width: `${((Object.values(DebateStage).indexOf(stage) + 1) / 5) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-6 pr-2 scrollbar-thin scrollbar-thumb-slate-200"
        >
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                    msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-white text-slate-600 border border-slate-200'
                  }`}>
                    {msg.role === 'user' ? <User className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
                  </div>
                  <div className="space-y-2">
                    <div className={`p-4 rounded-2xl shadow-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-tr-none' 
                        : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center animate-pulse">
                  <Bot className="w-6 h-6 text-slate-400" />
                </div>
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-white p-4 rounded-2xl shadow-lg border border-slate-200">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="메시지를 입력하세요..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-14 transition-all"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="bg-indigo-600 text-white p-4 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-95"
            >
              <Send className="w-6 h-6" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-400 font-medium uppercase tracking-widest">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              토론 예절 준수
            </div>
            <div className="flex items-center gap-1">
              <Info className="w-3 h-3 text-blue-500" />
              상세 피드백 제공
            </div>
            <div className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-amber-500" />
              높임말 사용
            </div>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="py-4 text-center text-xs text-slate-400">
        <p>© 2024 초등 토론 연습 메이트 - 국어 교과 연계 AI 튜터</p>
      </footer>
    </div>
  );
}
