import React, { useState, useMemo, useEffect } from 'react';
import { 
  Trophy, Medal, PlusCircle, List, Search, User, Calendar, 
  Trash2, Award, Clock, Edit2, Check, X, Download, Upload, 
  AlertTriangle, TrendingUp, Lock, ArrowUpDown, Filter, ChevronRight
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid 
} from 'recharts';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, 
  onSnapshot, updateDoc, writeBatch, getDocs 
} from 'firebase/firestore';

// ----------------------------------------------------------------------
// 1. Firebase 連線設定
// ----------------------------------------------------------------------
// 若要在您的 Firebase 雲端環境連線，請確認此處的金鑰設定
const firebaseConfig = {
  apiKey: "AIzaSyB68u1wK495yoIUmD7O8qiT-ktt52SPuMY",
  authDomain: "track-and-field-7a7c6.firebaseapp.com",
  projectId: "track-and-field-7a7c6",
  storageBucket: "track-and-field-7a7c6.firebasestorage.app",
  messagingSenderId: "188366563669",
  appId: "1:188366563669:web:7a15c130b751a2a93ea7dc"
};

let db = null;
try {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.warn("Firebase 初始化提示 (可繼續使用本機儲存與展示資料):", e);
}

// 成績字串數值化（用於田徑賽排序與圖表座標）
const parseScore = (scoreStr) => {
  if (!scoreStr || String(scoreStr).trim().toUpperCase() === 'X') return null;
  const str = String(scoreStr).trim();
  if (str.includes(':')) {
    const parts = str.split(':');
    if (parts.length === 2) {
      const mins = parseFloat(parts[0]);
      const secs = parseFloat(parts[1]);
      if (!isNaN(mins) && !isNaN(secs)) return mins * 60 + secs;
    }
  }
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
};

// 判定是否為徑賽項目（時間越短越優秀；田賽則數值越高越優秀）
const isTrackEvent = (eventName) => {
  if (!eventName) return false;
  const trackKeywords = ['m', '欄', '接力', '跑', '競走'];
  return trackKeywords.some(kw => eventName.toLowerCase().includes(kw.toLowerCase()));
};

// 組別標準化防呆處理
const normalizeGender = (gender) => {
  if (!gender) return '男';
  const g = String(gender).trim();
  if (g.includes('女')) return '女';
  return '男';
};

const INITIAL_RECORDS = [
  { id: '1', date: '2026-03-15', gender: '男', competition: '115師生盃', event: '跳遠', athlete: '李元澄', score: '5.45', rank: '6' },
  { id: '2', date: '2026-03-15', gender: '男', competition: '115師生盃', event: '跳高', athlete: '李元澄', score: '1.50', rank: '5' },
  { id: '3', date: '2026-03-15', gender: '男', competition: '115師生盃', event: '跳高', athlete: '陳宇全', score: '1.70', rank: '1' },
  { id: '4', date: '2026-03-15', gender: '男', competition: '115師生盃', event: '100m', athlete: '陳宇全', score: '12.20', rank: '3' },
  { id: '5', date: '2026-03-15', gender: '男', competition: '115師生盃', event: '400m', athlete: '謝銘澤', score: '1:10.34', rank: '' },
  { id: '6', date: '2026-03-15', gender: '男', competition: '115師生盃', event: '標槍', athlete: '謝銘澤', score: '20.98', rank: '' },
  { id: '7', date: '2026-03-15', gender: '男', competition: '115師生盃', event: '110欄', athlete: '黃彥右', score: '17.80', rank: '2' },
  { id: '8', date: '2026-03-15', gender: '男', competition: '115師生盃', event: '400欄', athlete: '黃彥右', score: '1:04.47', rank: '2' },
  { id: '9', date: '2026-03-15', gender: '男', competition: '115師生盃', event: '100m', athlete: '林渝鈜', score: '12.43', rank: '5' },
  { id: '10', date: '2026-03-15', gender: '男', competition: '115師生盃', event: '跳遠', athlete: '林渝鈜', score: '4.66', rank: '' },
  { id: '11', date: '2026-02-20', gender: '男', competition: '115年縣運', event: '跳遠', athlete: '李元澄', score: '5.26', rank: '4' },
  { id: '12', date: '2025-11-10', gender: '男', competition: '114中小運', event: '跳遠', athlete: '李元澄', score: '5.10', rank: '' },
  { id: '13', date: '2025-05-18', gender: '男', competition: '114師生盃', event: '跳遠', athlete: '李元澄', score: '5.25', rank: '5' },
  { id: '14', date: '2026-03-15', gender: '女', competition: '115師生盃', event: '100m', athlete: '張語涵', score: '13.15', rank: '1' },
  { id: '15', date: '2026-03-15', gender: '女', competition: '115師生盃', event: '跳高', athlete: '林芷琳', score: '1.45', rank: '2' },
  { id: '16', date: '2026-02-20', gender: '女', competition: '115年縣運', event: '100m', athlete: '張語涵', score: '13.40', rank: '2' },
  { id: '17', date: '2025-11-10', gender: '女', competition: '114中小運', event: '100m', athlete: '張語涵', score: '13.80', rank: '3' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('best');
  const [records, setRecords] = useState(() => {
    const saved = localStorage.getItem('track_records_data');
    return saved ? JSON.parse(saved) : INITIAL_RECORDS;
  });
  const [bestGender, setBestGender] = useState('男');
  const [loading, setLoading] = useState(false);

  // 同步資料至 LocalStorage
  useEffect(() => {
    localStorage.setItem('track_records_data', JSON.stringify(records));
  }, [records]);

  // 若有設置 Firestore 則即時監聽雲端資料庫
  useEffect(() => {
    if (!db || firebaseConfig.apiKey === "YOUR_API_KEY") return;
    try {
      const unsubscribe = onSnapshot(collection(db, 'records'), (snapshot) => {
        if (!snapshot.empty) {
          const cloudData = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
          }));
          cloudData.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          setRecords(cloudData);
        }
      }, (err) => {
        console.warn("Firestore 即時監聽失敗，維持本機資料模式:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn("Firestore 連線略過:", e);
    }
  }, []);

  const uniqueCompetitions = useMemo(() => [...new Set(records.map(r => r.competition))].filter(Boolean), [records]);
  const uniqueEvents = useMemo(() => [...new Set(records.map(r => r.event))].filter(Boolean), [records]);
  const uniqueAthletes = useMemo(() => [...new Set(records.map(r => r.athlete))].filter(Boolean), [records]);

  // 各項目歷年最佳成績（男女分開統計）
  const bestRecordsByEvent = useMemo(() => {
    const grouped = {};
    records.forEach(record => {
      if (normalizeGender(record.gender) !== bestGender) return;
      if (!record.event || !record.score || String(record.score).toUpperCase() === 'X') return;
      const scoreValue = parseScore(record.score);
      if (scoreValue === null) return;

      if (!grouped[record.event]) grouped[record.event] = [];
      grouped[record.event].push({ ...record, scoreValue });
    });

    const result = {};
    for (const [event, items] of Object.entries(grouped)) {
      const isTrack = isTrackEvent(event);
      items.sort((a, b) => isTrack ? a.scoreValue - b.scoreValue : b.scoreValue - a.scoreValue);

      const topUnique = [];
      const seenAthletes = new Set();
      for (const item of items) {
        if (!seenAthletes.has(item.athlete)) {
          seenAthletes.add(item.athlete);
          topUnique.push(item);
          if (topUnique.length === 3) break;
        }
      }
      result[event] = { isTrack, topRecords: topUnique };
    }
    return result;
  }, [records, bestGender]);

  // -------------------------------------------------------------
  // View 1: 歷年最佳 (PB 排行榜)
  // -------------------------------------------------------------
  const BestRecordsView = () => {
    const eventKeys = Object.keys(bestRecordsByEvent).sort();

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 text-white p-6 rounded-3xl shadow-xl">
          <div>
            <h2 className="text-2xl font-black flex items-center gap-2">
              <Trophy className="text-amber-400" /> 各項目歷年最佳紀錄 (PB)
            </h2>
            <p className="text-indigo-200 text-sm mt-1">
              自動依徑賽/田賽判定排序規則（徑賽時間越少越佳、田賽距離高度越大越佳），男女成績分開統計。
            </p>
          </div>

          {/* 男女組別切換器 */}
          <div className="flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-2xl border border-white/10 self-start sm:self-auto backdrop-blur-md">
            <button
              onClick={() => setBestGender('男')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5 ${
                bestGender === '男'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              👦 男子組
            </button>
            <button
              onClick={() => setBestGender('女')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5 ${
                bestGender === '女'
                  ? 'bg-pink-600 text-white shadow-lg'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              👧 女子組
            </button>
          </div>
        </div>

        {eventKeys.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {eventKeys.map(eventName => {
              const data = bestRecordsByEvent[eventName];
              return (
                <div key={eventName} className="bg-white rounded-3xl shadow-sm hover:shadow-md transition border border-slate-100 overflow-hidden flex flex-col">
                  <div className="bg-slate-900 text-white px-5 py-3.5 flex justify-between items-center">
                    <h3 className="font-bold text-base flex items-center gap-2">
                      <span className="text-indigo-400">⚡</span> {eventName}
                    </h3>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      data.isTrack 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {data.isTrack ? '徑賽 (時間)' : '田賽 (高度/距離)'}
                    </span>
                  </div>
                  <div className="p-5 flex-grow">
                    <ul className="space-y-3">
                      {data.topRecords.map((rec, index) => {
                        const medalColor = index === 0 ? 'text-amber-500 bg-amber-50 border-amber-200' :
                                          index === 1 ? 'text-slate-500 bg-slate-50 border-slate-200' :
                                          'text-amber-800 bg-amber-50/50 border-amber-200/50';
                        return (
                          <li key={rec.id || index} className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 transition">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm border ${medalColor}`}>
                                {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                              </div>
                              <div>
                                <p className="font-bold text-slate-800 text-sm">{rec.athlete}</p>
                                <p className="text-xs text-slate-400 flex items-center gap-1">
                                  {rec.date && <span>{rec.date} · </span>}
                                  <span>{rec.competition}</span>
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={`text-base font-black ${index === 0 ? 'text-indigo-600' : 'text-slate-700'}`}>
                                {rec.score}
                              </span>
                              {rec.rank && (
                                <span className="block text-[10px] text-slate-400">第 {rec.rank} 名</span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-16 text-center shadow-sm border border-slate-100">
            <Trophy className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">目前【{bestGender === '男' ? '男子組' : '女子組'}】尚無任何成績紀錄</p>
          </div>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------
  // View 2: 選手檔案 (歷程由新到舊降冪排序)
  // -------------------------------------------------------------
  const AthleteProfileView = () => {
    const [selectedAthlete, setSelectedAthlete] = useState(uniqueAthletes[0] || '');

    useEffect(() => {
      if (!selectedAthlete && uniqueAthletes.length > 0) {
        setSelectedAthlete(uniqueAthletes[0]);
      }
    }, [uniqueAthletes, selectedAthlete]);

    // 歷史紀錄排序：嚴格由「新」到「舊」
    const athleteRecords = records
      .filter(r => r.athlete === selectedAthlete)
      .sort((a, b) => (b.date || '0000-00-00').localeCompare(a.date || '0000-00-00'));

    let golds = 0, medals = 0;
    const comps = new Set();
    const eventPBMap = {};

    athleteRecords.forEach(r => {
      comps.add(r.competition);
      if (r.rank === '1') { golds++; medals++; }
      else if (r.rank === '2' || r.rank === '3') { medals++; }

      const val = parseScore(r.score);
      if (val !== null) {
        if (!eventPBMap[r.event]) {
          eventPBMap[r.event] = r;
        } else {
          const isTrack = isTrackEvent(r.event);
          const currVal = parseScore(eventPBMap[r.event].score);
          if (isTrack ? val < currVal : val > currVal) {
            eventPBMap[r.event] = r;
          }
        }
      }
    });

    const athleteGender = athleteRecords[0] ? normalizeGender(athleteRecords[0].gender) : '男';

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border ${
              athleteGender === '女' ? 'bg-pink-50 border-pink-100' : 'bg-blue-50 border-blue-100'
            }`}>
              {athleteGender === '女' ? '👧' : '👦'}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <span>{selectedAthlete || '請選擇選手'}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  athleteGender === '女' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {athleteGender === '女' ? '女子組' : '男子組'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">個人歷年最佳紀錄與完整出賽歷史</p>
            </div>
          </div>

          <div className="w-full md:w-64">
            <label className="block text-xs font-semibold text-slate-500 mb-1">選擇選手</label>
            <select 
              value={selectedAthlete} 
              onChange={e => setSelectedAthlete(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {uniqueAthletes.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 選手統計概覽 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <p className="text-xs font-bold text-slate-400">總出賽次數</p>
            <p className="text-2xl font-black text-slate-800 mt-1">{athleteRecords.length} <span className="text-xs font-normal text-slate-400">次</span></p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <p className="text-xs font-bold text-slate-400">出戰賽事數</p>
            <p className="text-2xl font-black text-indigo-600 mt-1">{comps.size} <span className="text-xs font-normal text-slate-400">場</span></p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <p className="text-xs font-bold text-slate-400">金牌數 (第 1 名)</p>
            <p className="text-2xl font-black text-amber-500 mt-1">{golds} <span className="text-xs font-normal text-slate-400">面</span></p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <p className="text-xs font-bold text-slate-400">總獎牌數 (前 3 名)</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{medals} <span className="text-xs font-normal text-slate-400">面</span></p>
          </div>
        </div>

        {/* 個人最佳 PB 卡片 */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Trophy className="text-amber-500" size={20} /> 個人最佳紀錄 (PB)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(eventPBMap).map(([evt, pb]) => (
              <div key={evt} className="p-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 flex justify-between items-center">
                <div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{evt}</span>
                  <p className="text-xs text-slate-500 mt-2">{pb.competition}</p>
                  <p className="text-[10px] text-slate-400">{pb.date || '未標記日期'}</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black text-indigo-700 block">{pb.score}</span>
                  {pb.rank && <span className="text-[10px] text-amber-600 font-bold">第 {pb.rank} 名</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 參賽歷史明細：依日期由新到舊排序 */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="text-indigo-600" size={20} /> 參賽歷史明細
            </h3>
            <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full font-medium">
              由新到舊排序（最新在最上方）
            </span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-5 py-3.5 text-left font-bold">賽事日期</th>
                  <th className="px-5 py-3.5 text-left font-bold">賽事名稱</th>
                  <th className="px-5 py-3.5 text-left font-bold">比賽項目</th>
                  <th className="px-5 py-3.5 text-left font-bold">組別</th>
                  <th className="px-5 py-3.5 text-left font-bold">成績</th>
                  <th className="px-5 py-3.5 text-left font-bold">名次</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {athleteRecords.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-5 py-3.5 text-slate-500 font-medium whitespace-nowrap">{r.date || '-'}</td>
                    <td className="px-5 py-3.5 text-slate-800 font-bold whitespace-nowrap">{r.competition}</td>
                    <td className="px-5 py-3.5 text-indigo-600 font-bold whitespace-nowrap">{r.event}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        normalizeGender(r.gender) === '女' ? 'bg-pink-50 text-pink-600 border border-pink-200' : 'bg-blue-50 text-blue-600 border border-blue-200'
                      }`}>
                        {normalizeGender(r.gender) === '女' ? '女子組' : '男子組'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-black text-slate-900 whitespace-nowrap">{r.score}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {r.rank ? (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          r.rank === '1' ? 'bg-amber-100 text-amber-800' :
                          r.rank === '2' ? 'bg-slate-200 text-slate-700' :
                          r.rank === '3' ? 'bg-amber-800/10 text-amber-900' : 'bg-slate-100 text-slate-600'
                        }`}>
                          第 {r.rank} 名
                        </span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // View 3: 趨勢圖表 (時間軸由舊到新、由左至右排序)
  // -------------------------------------------------------------
  const AnalyticsView = () => {
    const [chartAthlete, setChartAthlete] = useState(uniqueAthletes[0] || '');
    const athleteEvents = useMemo(() => {
      return [...new Set(records.filter(r => r.athlete === chartAthlete).map(r => r.event))];
    }, [chartAthlete]);

    const [chartEvent, setChartEvent] = useState('');

    useEffect(() => {
      if (!chartAthlete && uniqueAthletes.length > 0) setChartAthlete(uniqueAthletes[0]);
    }, [uniqueAthletes, chartAthlete]);

    useEffect(() => {
      if (athleteEvents.length > 0 && !athleteEvents.includes(chartEvent)) {
        setChartEvent(athleteEvents[0]);
      }
    }, [athleteEvents, chartEvent]);

    // 趨勢圖表：嚴格依照賽事日期由「舊」到「新」升冪排序 (由左至右遞進)
    const chartData = useMemo(() => {
      return records
        .filter(r => r.athlete === chartAthlete && r.event === chartEvent)
        .map(r => ({
          ...r,
          val: parseScore(r.score)
        }))
        .filter(r => r.val !== null)
        .sort((a, b) => (a.date || '0000-00-00').localeCompare(b.date || '0000-00-00'));
    }, [chartAthlete, chartEvent]);

    const isTrack = isTrackEvent(chartEvent);

    const CustomTooltip = ({ active, payload }) => {
      if (active && payload && payload.length) {
        const item = payload[0].payload;
        return (
          <div className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs space-y-1">
            <p className="font-bold text-indigo-300">{item.date ? `${item.date} · ` : ''}{item.competition}</p>
            <p className="text-sm">項目: <span className="font-bold text-white">{item.event}</span></p>
            <p className="text-base font-black text-amber-400">成績: {item.score}</p>
            {item.rank && <p className="text-slate-300">名次: 第 {item.rank} 名</p>}
          </div>
        );
      }
      return null;
    };

    return (
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp className="text-indigo-600" /> 選手歷程成長趨勢分析
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            橫軸時間線嚴格由舊到新（左至右）排列，支援時間軸直覺呈現個人成績進步軌跡。
          </p>
        </div>

        {/* 篩選控制器 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">選擇選手</label>
            <select 
              value={chartAthlete} 
              onChange={e => setChartAthlete(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {uniqueAthletes.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">選擇項目</label>
            <select 
              value={chartEvent} 
              onChange={e => setChartEvent(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {athleteEvents.map(e => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-between items-center text-xs font-bold text-slate-500 px-1">
          <span>
            項目屬性: <strong className="text-indigo-600">{isTrack ? '徑賽 (時間越短越優秀)' : '田賽 (距離高度越大越佳)'}</strong>
          </span>
          <span>出賽次數: <strong className="text-slate-800">{chartData.length} 次</strong></span>
        </div>

        {/* 折線圖區域 */}
        {chartData.length > 0 ? (
          <div className="w-full h-80 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(val, idx) => val || chartData[idx]?.competition || `#${idx+1}`}
                />
                <YAxis 
                  reversed={isTrack}
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line 
                  type="monotone" 
                  dataKey="val" 
                  stroke="#4f46e5" 
                  strokeWidth={3} 
                  dot={{ r: 6, fill: '#4f46e5', stroke: '#ffffff', strokeWidth: 2 }} 
                  activeDot={{ r: 8, fill: '#6366f1' }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="bg-slate-50 rounded-2xl p-12 text-center text-slate-400 text-sm border border-dashed border-slate-200">
            該選手在目前所選項目尚無可視覺化的成績點
          </div>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------
  // View 4: 成績總覽 (含組別篩選、日期排序與修改刪除)
  // -------------------------------------------------------------
  const AllRecordsView = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGender, setFilterGender] = useState('ALL');
    const [filterComp, setFilterComp] = useState('ALL');
    const [filterEvt, setFilterEvt] = useState('ALL');
    const [editingId, setEditingId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    const handleStartEdit = (r) => {
      setEditingId(r.id);
      setEditFormData({ ...r });
    };

    const handleSaveEdit = async () => {
      if (!editFormData.competition || !editFormData.event || !editFormData.athlete || !editFormData.score) {
        alert('請填寫必填欄位 (賽事、項目、選手、成績)');
        return;
      }
      setRecords(prev => prev.map(r => r.id === editingId ? { ...editFormData } : r));
      if (db) {
        try {
          await updateDoc(doc(db, 'records', editingId), editFormData);
        } catch (e) {
          console.warn("Firestore 更新失敗，已保留本機紀錄:", e);
        }
      }
      setEditingId(null);
    };

    const handleDeleteRecord = async (id) => {
      if (window.confirm('確定要刪除這筆成績紀錄嗎？')) {
        setRecords(prev => prev.filter(r => r.id !== id));
        if (db) {
          try {
            await deleteDoc(doc(db, 'records', id));
          } catch (e) {
            console.warn("Firestore 刪除失敗，已同步本機刪除:", e);
          }
        }
      }
    };

    const filteredRecords = useMemo(() => {
      return records.filter(r => {
        const matchSearch = (r.athlete || '').includes(searchTerm) || 
                            (r.competition || '').includes(searchTerm) || 
                            (r.event || '').includes(searchTerm);
        const matchGender = filterGender === 'ALL' || normalizeGender(r.gender) === filterGender;
        const matchComp = filterComp === 'ALL' || r.competition === filterComp;
        const matchEvt = filterEvt === 'ALL' || r.event === filterEvt;
        return matchSearch && matchGender && matchComp && matchEvt;
      }).sort((a, b) => (b.date || '0000-00-00').localeCompare(a.date || '0000-00-00'));
    }, [records, searchTerm, filterGender, filterComp, filterEvt]);

    return (
      <div className="bg-white rounded-3xl shadow-sm p-6 border border-slate-100 space-y-6">
        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <List className="text-indigo-600" /> 成績總覽資料庫
            </h2>
            <p className="text-xs text-slate-400 mt-1">共 {filteredRecords.length} 筆符合條件之成績紀錄</p>
          </div>

          {/* 篩選器工具列 */}
          <div className="flex flex-wrap gap-2.5 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="搜尋選手、賽事..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none w-44 sm:w-52"
              />
            </div>

            {/* 組別篩選 */}
            <select 
              value={filterGender} 
              onChange={e => setFilterGender(e.target.value)}
              className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ALL">全部組別</option>
              <option value="男">👦 男子組</option>
              <option value="女">👧 女子組</option>
            </select>

            <select 
              value={filterComp} 
              onChange={e => setFilterComp(e.target.value)}
              className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ALL">所有賽事</option>
              {uniqueCompetitions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select 
              value={filterEvt} 
              onChange={e => setFilterEvt(e.target.value)}
              className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ALL">所有項目</option>
              {uniqueEvents.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>

        {/* 成績清單表格 */}
        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3.5 text-left font-bold whitespace-nowrap">賽事日期</th>
                <th className="px-4 py-3.5 text-left font-bold whitespace-nowrap">組別</th>
                <th className="px-4 py-3.5 text-left font-bold whitespace-nowrap">賽事名稱</th>
                <th className="px-4 py-3.5 text-left font-bold whitespace-nowrap">比賽項目</th>
                <th className="px-4 py-3.5 text-left font-bold whitespace-nowrap">選手姓名</th>
                <th className="px-4 py-3.5 text-left font-bold whitespace-nowrap">成績</th>
                <th className="px-4 py-3.5 text-left font-bold whitespace-nowrap">名次</th>
                <th className="px-4 py-3.5 text-right font-bold whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredRecords.length > 0 ? (
                filteredRecords.map(r => {
                  const isEditing = editingId === r.id;
                  const genderNorm = normalizeGender(r.gender);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      {isEditing ? (
                        <>
                          <td className="px-3 py-2"><input type="date" value={editFormData.date || ''} onChange={e => setEditFormData({ ...editFormData, date: e.target.value })} className="w-full p-1 text-xs border rounded-lg" /></td>
                          <td className="px-3 py-2">
                            <select value={editFormData.gender || '男'} onChange={e => setEditFormData({ ...editFormData, gender: e.target.value })} className="p-1 text-xs border rounded-lg font-bold">
                              <option value="男">男</option>
                              <option value="女">女</option>
                            </select>
                          </td>
                          <td className="px-3 py-2"><input type="text" value={editFormData.competition || ''} onChange={e => setEditFormData({ ...editFormData, competition: e.target.value })} className="w-full p-1 text-xs border rounded-lg" /></td>
                          <td className="px-3 py-2"><input type="text" value={editFormData.event || ''} onChange={e => setEditFormData({ ...editFormData, event: e.target.value })} className="w-full p-1 text-xs border rounded-lg" /></td>
                          <td className="px-3 py-2"><input type="text" value={editFormData.athlete || ''} onChange={e => setEditFormData({ ...editFormData, athlete: e.target.value })} className="w-full p-1 text-xs border rounded-lg" /></td>
                          <td className="px-3 py-2"><input type="text" value={editFormData.score || ''} onChange={e => setEditFormData({ ...editFormData, score: e.target.value })} className="w-full p-1 text-xs border rounded-lg font-bold" /></td>
                          <td className="px-3 py-2"><input type="text" value={editFormData.rank || ''} onChange={e => setEditFormData({ ...editFormData, rank: e.target.value })} placeholder="無" className="w-16 p-1 text-xs border rounded-lg" /></td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button onClick={handleSaveEdit} className="text-emerald-600 hover:text-emerald-700 p-1 mr-1"><Check size={18} /></button>
                            <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3.5 text-slate-500 font-medium whitespace-nowrap">{r.date || '-'}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                              genderNorm === '女' ? 'bg-pink-50 text-pink-600 border border-pink-200' : 'bg-blue-50 text-blue-600 border border-blue-200'
                            }`}>
                              {genderNorm === '女' ? '女' : '男'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-800 font-bold whitespace-nowrap">{r.competition}</td>
                          <td className="px-4 py-3.5 text-indigo-600 font-bold whitespace-nowrap">{r.event}</td>
                          <td className="px-4 py-3.5 text-slate-900 font-bold whitespace-nowrap">{r.athlete}</td>
                          <td className="px-4 py-3.5 text-slate-900 font-black whitespace-nowrap">{r.score}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {r.rank ? <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold">第 {r.rank} 名</span> : <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <button onClick={() => handleStartEdit(r)} className="text-indigo-600 hover:text-indigo-800 p-1 mr-2"><Edit2 size={16} /></button>
                            <button onClick={() => handleDeleteRecord(r.id)} className="text-rose-500 hover:text-rose-700 p-1"><Trash2 size={16} /></button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">尚無符合條件的成績紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // View 5: 新增與管理 (密碼防護、CSV 匯出入、一鍵刪除)
  // -------------------------------------------------------------
  const AddRecordForm = () => {
    // 獨立於元件內的密碼狀態，避免輸入時焦點跑位
    const [passwordInput, setPasswordInput] = useState('');
    const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);

    const [formData, setFormData] = useState({
      date: new Date().toISOString().split('T')[0],
      gender: '男',
      competition: '',
      event: '',
      athlete: '',
      score: '',
      rank: ''
    });

    const handleUnlock = (e) => {
      e.preventDefault();
      if (passwordInput === 'admin888') {
        setIsAdminUnlocked(true);
      } else {
        alert('密碼錯誤，請重新輸入！');
        setPasswordInput('');
      }
    };

    const handleFormSubmit = async (e) => {
      e.preventDefault();
      if (!formData.competition || !formData.event || !formData.athlete || !formData.score) {
        alert('請填寫必填欄位 (賽事、項目、選手、成績)');
        return;
      }

      const newRecord = {
        id: Date.now().toString(),
        ...formData,
        createdAt: new Date().toISOString()
      };

      setRecords(prev => [newRecord, ...prev]);

      if (db) {
        try {
          await addDoc(collection(db, 'records'), newRecord);
        } catch (err) {
          console.warn("雲端寫入略過，已儲存至本機:", err);
        }
      }

      setFormData(prev => ({
        ...prev,
        athlete: '',
        score: '',
        rank: ''
      }));
      alert('成績已成功記錄！');
    };

    // 一鍵清空所有資料（單次確認提醒）
    const handleDeleteAll = async () => {
      if (records.length === 0) {
        alert('目前資料庫已經是空的囉！');
        return;
      }

      const confirmDelete = window.confirm('⚠️ 警告：確定要清空「所有」成績資料嗎？\n此動作將清空所有成績紀錄，無法復原。建議先匯出 CSV 備份！');
      if (!confirmDelete) return;

      if (db) {
        try {
          const snapshot = await getDocs(collection(db, 'records'));
          const batch = writeBatch(db);
          snapshot.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        } catch (e) {
          console.warn("雲端清空錯誤:", e);
        }
      }

      setRecords([]);
      alert('所有資料已成功清空！');
    };

    // CSV 匯出
    const exportCSV = () => {
      if (records.length === 0) {
        alert('目前沒有資料可供匯出');
        return;
      }
      const headers = ['賽事日期', '組別', '賽事名稱', '比賽項目', '選手姓名', '成績', '名次'];
      const rows = records.map(r => [
        r.date || '',
        normalizeGender(r.gender),
        r.competition || '',
        r.event || '',
        r.athlete || '',
        r.score || '',
        r.rank || ''
      ]);
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `田徑隊成績備份_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    };

    // CSV 匯入（相容新舊格式）
    const importCSV = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const text = evt.target.result.replace(/^\uFEFF/, '');
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length <= 1) {
            alert('檔案無有效資料');
            return;
          }

          const imported = [];
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
            // 7欄格式：日期, 組別, 賽事, 項目, 選手, 成績, 名次
            if (cols.length >= 6) {
              const hasDateFirst = cols[0].includes('-');
              imported.push({
                id: `${Date.now()}-${i}`,
                date: hasDateFirst ? cols[0] : new Date().toISOString().split('T')[0],
                gender: hasDateFirst ? normalizeGender(cols[1]) : (cols.length >= 7 ? normalizeGender(cols[6]) : '男'),
                competition: hasDateFirst ? cols[2] : cols[0],
                event: hasDateFirst ? cols[3] : cols[1],
                athlete: hasDateFirst ? cols[4] : cols[2],
                score: hasDateFirst ? cols[5] : cols[3],
                rank: hasDateFirst ? (cols[6] || '') : (cols[4] || '')
              });
            }
          }

          if (imported.length > 0) {
            setRecords(prev => [...imported, ...prev]);
            alert(`成功匯入 ${imported.length} 筆成績資料！`);
          } else {
            alert('未能辨識出成績格式，請確認欄位順序');
          }
        } catch (err) {
          alert('讀取 CSV 檔案失敗');
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    };

    if (!isAdminUnlocked) {
      return (
        <div className="max-w-md mx-auto bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center my-12">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">管理權限驗證</h2>
          <p className="text-xs text-slate-400 mt-1 mb-6">請輸入管理員密碼以進入新增與備份系統</p>
          <form onSubmit={handleUnlock} className="space-y-4">
            <input 
              type="password" 
              placeholder="請輸入密碼" 
              value={passwordInput} 
              onChange={e => setPasswordInput(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-sm font-bold tracking-widest focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition text-sm shadow-md"
            >
              驗證並進入
            </button>
          </form>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 新增成績表單 */}
        <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm p-6 border border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <PlusCircle className="text-indigo-600" /> 新增比賽成績紀錄
          </h2>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">賽事開始日期 *</label>
                <input 
                  type="date" 
                  required 
                  value={formData.date} 
                  onChange={e => setFormData({ ...formData, date: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">參賽組別 *</label>
                <select 
                  value={formData.gender} 
                  onChange={e => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="男">👦 男子組</option>
                  <option value="女">👧 女子組</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">賽事名稱 *</label>
                <input 
                  type="text" 
                  required 
                  list="competitions-dl"
                  placeholder="例如: 115師生盃"
                  value={formData.competition} 
                  onChange={e => setFormData({ ...formData, competition: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <datalist id="competitions-dl">
                  {uniqueCompetitions.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">比賽項目 *</label>
                <input 
                  type="text" 
                  required 
                  list="events-dl"
                  placeholder="例如: 100m, 跳遠"
                  value={formData.event} 
                  onChange={e => setFormData({ ...formData, event: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <datalist id="events-dl">
                  {uniqueEvents.map(e => <option key={e} value={e} />)}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">選手姓名 *</label>
                <input 
                  type="text" 
                  required 
                  list="athletes-dl"
                  placeholder="例如: 李元澄"
                  value={formData.athlete} 
                  onChange={e => setFormData({ ...formData, athlete: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <datalist id="athletes-dl">
                  {uniqueAthletes.map(a => <option key={a} value={a} />)}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">成績 *</label>
                <input 
                  type="text" 
                  required 
                  placeholder="例如: 12.34 或 1:10.34 或 5.45"
                  value={formData.score} 
                  onChange={e => setFormData({ ...formData, score: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1">大會名次 (選填)</label>
                <input 
                  type="text" 
                  placeholder="例如: 1, 2, 3... 留空代表無"
                  value={formData.rank} 
                  onChange={e => setFormData({ ...formData, rank: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl transition flex justify-center items-center gap-2 shadow-md text-sm mt-4"
            >
              <PlusCircle size={18} /> 儲存至資料庫
            </button>
          </form>
        </div>

        {/* 備份與一鍵清空 */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl shadow-sm p-6 border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
              <Download className="text-emerald-600" size={20} /> 資料備份與還原
            </h3>
            <p className="text-xs text-slate-400 mb-4">定期匯出 CSV 檔，保障資料安全。</p>
            <div className="space-y-3">
              <button 
                onClick={exportCSV} 
                className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold py-3 px-4 rounded-xl transition text-xs border border-emerald-200 flex items-center justify-center gap-2"
              >
                <Download size={16} /> 匯出 CSV 資料檔
              </button>

              <label className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-3 px-4 rounded-xl transition text-xs border border-blue-200 flex items-center justify-center gap-2 cursor-pointer">
                <Upload size={16} /> 匯入 CSV 資料檔
                <input type="file" accept=".csv" onChange={importCSV} className="hidden" />
              </label>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm p-6 border border-rose-100">
            <h3 className="text-lg font-bold text-rose-600 mb-2 flex items-center gap-2">
              <AlertTriangle size={20} /> 危險管理區
            </h3>
            <p className="text-xs text-slate-400 mb-4">清空所有成績紀錄，通常用於新學年重新建檔。</p>
            <button 
              onClick={handleDeleteAll} 
              className="w-full bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white font-bold py-3 px-4 rounded-xl border border-rose-200 transition text-xs flex items-center justify-center gap-2"
            >
              <Trash2 size={16} /> 一鍵清空所有資料
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
      {/* 頂部導航列 */}
      <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-xl shadow-inner">
                🏆
              </div>
              <div>
                <h1 className="text-lg font-black tracking-wide">校園田徑隊成績管理系統</h1>
                <p className="text-[10px] text-slate-400 hidden sm:block">Track & Field Performance Analytics</p>
              </div>
            </div>

            <div className="text-xs bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-full text-slate-300 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>雲端/離線同步就緒</span>
            </div>
          </div>
        </div>
      </header>

      {/* 分頁按鈕列 */}
      <nav className="bg-white border-b border-slate-200 sticky top-16 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-2 overflow-x-auto py-2.5">
            <button 
              onClick={() => setActiveTab('best')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-2xl whitespace-nowrap transition ${
                activeTab === 'best' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Trophy size={16} /> 歷年最佳
            </button>
            <button 
              onClick={() => setActiveTab('athletes')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-2xl whitespace-nowrap transition ${
                activeTab === 'athletes' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <User size={16} /> 選手檔案
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-2xl whitespace-nowrap transition ${
                activeTab === 'analytics' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <TrendingUp size={16} /> 趨勢圖表
            </button>
            <button 
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-2xl whitespace-nowrap transition ${
                activeTab === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <List size={16} /> 成績總覽
            </button>
            <button 
              onClick={() => setActiveTab('add')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-2xl whitespace-nowrap transition ${
                activeTab === 'add' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <PlusCircle size={16} /> 新增/管理
            </button>
          </div>
        </div>
      </nav>

      {/* 主畫面分頁切換 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {activeTab === 'best' && <BestRecordsView />}
        {activeTab === 'athletes' && <AthleteProfileView />}
        {activeTab === 'analytics' && <AnalyticsView />}
        {activeTab === 'all' && <AllRecordsView />}
        {activeTab === 'add' && <AddRecordForm />}
      </main>
    </div>
  );
}