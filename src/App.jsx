import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Trophy, Medal, PlusCircle, List, Search, User, 
  Trash2, Award, Edit2, Check, X, TrendingUp, Download, Upload, AlertCircle, Save, Lock
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

// 匯入 Firebase 模組
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch 
} from 'firebase/firestore';

// ==========================================
// ⚠️ Firebase 設定區
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyB68u1wK495yoIUmD7O8qiT-ktt52SPuMY",
    authDomain: "track-and-field-7a7c6.firebaseapp.com",
    projectId: "track-and-field-7a7c6",
    storageBucket: "track-and-field-7a7c6.firebasestorage.app",
    messagingSenderId: "188366563669",
    appId: "1:188366563669:web:7a15c130b751a2a93ea7dc"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'track-field-app';

// 解析成績為數值以便比較 (包含時間轉換)
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

// 判斷是否為徑賽 (徑賽成績越小越好)
const isTrackEvent = (eventName) => {
  if (!eventName) return false;
  const trackKeywords = ['m', '欄', '接力', '跑', '競走'];
  return trackKeywords.some(kw => eventName.includes(kw));
};

// 性別防呆與標準化 (處理舊資料與各種寫法)
const normalizeGender = (g) => {
  if (!g) return '男'; // 如果沒填，預設歸為男生
  const str = String(g).trim();
  if (str === '女' || str === '女子' || str === '女子組' || str.toLowerCase() === 'f' || str.toLowerCase() === 'female') return '女';
  return '男';
};

export default function TrackAndFieldManager() {
  const [activeTab, setActiveTab] = useState('best');
  const [records, setRecords] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState({ show: false, msg: '', isError: false });
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [bestGender, setBestGender] = useState('男'); // 新增歷年最佳性別切換狀態

  // 顯示提示訊息
  const showMessage = (msg, isError = false) => {
    setToastMsg({ show: true, msg, isError });
    setTimeout(() => setToastMsg({ show: false, msg: '', isError: false }), 3000);
  };

  // 1. 初始化 Firebase 驗證
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenError) {
            console.warn("自訂憑證不符 (您可能使用了自己的 Firebase Config)，自動切換為匿名登入...");
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
        showMessage("連線失敗：請至 Firebase 控制台啟用 Authentication 的「匿名 (Anonymous)」登入", true);
        setLoading(false); // 停止載入動畫
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. 讀取 Firestore 資料
  useEffect(() => {
    if (!user) return;
    
    // 定義公用資料庫路徑 (遵循 Mandatory Rules)
    const recordsRef = collection(db, 'artifacts', appId, 'public', 'data', 'trackRecords');
    
    const unsubscribe = onSnapshot(recordsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRecords(data);
      setLoading(false);
    }, (error) => {
      console.error("Firestore read error:", error);
      showMessage("讀取資料失敗，請確認 Firebase 權限", true);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 取得不重複的選項 (給表單、下拉選單自動完成使用)
  const uniqueCompetitions = [...new Set(records.map(r => r.competition))].filter(Boolean).sort();
  const uniqueEvents = [...new Set(records.map(r => r.event))].filter(Boolean).sort();
  const uniqueAthletes = [...new Set(records.map(r => r.athlete))].filter(Boolean).sort();

  // 計算歷年最佳成績 (Tab 1 專用)
  const bestRecordsByEvent = useMemo(() => {
    const grouped = {};
    records.forEach(record => {
      // 根據選擇的性別過濾 (使用 normalizeGender 防呆)
      if (normalizeGender(record.gender) !== bestGender) return;

      if (!record.event || !record.score || record.score.toUpperCase() === 'X') return;
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
  }, [records]);

  // -------------------------------------------------------------
  // View 1: 歷年最佳
  // -------------------------------------------------------------
  const BestRecordsView = () => {
    const eventKeys = Object.keys(bestRecordsByEvent).sort();
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-center bg-gradient-to-r from-indigo-600 to-indigo-800 text-white p-6 rounded-2xl shadow-lg gap-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="text-yellow-300" /> 各項目歷年最佳紀錄 (PB)
            </h2>
            <p className="text-indigo-100 text-sm mt-1">系統自動判斷排序規則，僅呈現選手個人最佳成績</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md p-1 rounded-xl flex shadow-inner">
              <button onClick={() => setBestGender('男')} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${bestGender === '男' ? 'bg-white text-indigo-700 shadow-md' : 'text-indigo-100 hover:bg-white/20'}`}>👦 男子組</button>
              <button onClick={() => setBestGender('女')} className={`px-4 py-2 rounded-lg font-bold text-sm transition ${bestGender === '女' ? 'bg-white text-pink-600 shadow-md' : 'text-indigo-100 hover:bg-white/20'}`}>👧 女子組</button>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl text-center border border-white/20 hidden sm:block">
              <span className="text-xs text-indigo-200 block">項目總數</span>
              <span className="text-xl font-black">{eventKeys.length}</span>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {eventKeys.length > 0 ? eventKeys.map(eventName => {
            const data = bestRecordsByEvent[eventName];
            return (
              <div key={eventName} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition">
                <div className="bg-slate-800 text-white px-5 py-3.5 flex justify-between items-center">
                  <h3 className="font-bold text-base flex items-center gap-2">⚡ {eventName}</h3>
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${data.isTrack ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                    {data.isTrack ? '徑賽 (時間)' : '田賽 (距離)'}
                  </span>
                </div>
                <div className="p-4 flex-grow">
                  <ul className="space-y-2">
                    {data.topRecords.map((record, index) => {
                       const badgeBg = index === 0 ? 'bg-amber-100 text-amber-700 border-amber-300' :
                                       index === 1 ? 'bg-slate-100 text-slate-600 border-slate-300' :
                                       'bg-amber-800/10 text-amber-900 border-amber-700/20';
                       const medalIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
                       return (
                        <li key={record.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs border ${badgeBg}`}>
                              {medalIcon}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900 text-sm">{record.athlete}</p>
                              <p className="text-[11px] text-gray-400">{record.competition}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`text-base font-black tracking-tight ${index === 0 ? 'text-indigo-600' : 'text-gray-700'}`}>{record.score}</span>
                            {record.rank && <span className="block text-[10px] text-gray-400">大會第 {record.rank} 名</span>}
                          </div>
                        </li>
                       );
                    })}
                  </ul>
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full bg-white p-12 text-center rounded-2xl shadow-sm border border-gray-100">
              <Trophy className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <p className="text-gray-500">目前雲端還沒有任何有效的成績紀錄。</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // View 2: 選手檔案
  // -------------------------------------------------------------
  const AthleteProfileView = () => {
    const [selectedAthlete, setSelectedAthlete] = useState(uniqueAthletes[0] || '');
    useEffect(() => { if (!selectedAthlete && uniqueAthletes.length > 0) setSelectedAthlete(uniqueAthletes[0]); }, [uniqueAthletes, selectedAthlete]);

    const athleteRecords = records.filter(r => r.athlete === selectedAthlete);
    
    let golds = 0, medals = 0;
    const comps = new Set();
    const pbMap = {};

    athleteRecords.forEach(r => {
      comps.add(r.competition);
      if (r.rank === '1') { golds++; medals++; }
      else if (r.rank === '2' || r.rank === '3') medals++;

      if (!pbMap[r.event]) pbMap[r.event] = [];
      pbMap[r.event].push(r);
    });

    const pbCards = [];
    Object.entries(pbMap).forEach(([evt, recs]) => {
      const isTrack = isTrackEvent(evt);
      const valRecs = recs.map(r => ({ ...r, val: parseScore(r.score) })).filter(r => r.val !== null);
      if (valRecs.length > 0) {
        valRecs.sort((a, b) => isTrack ? a.val - b.val : b.val - a.val);
        pbCards.push({ event: evt, best: valRecs[0], count: recs.length });
      }
    });

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center"><User className="text-indigo-500"/></div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">選手個人檔案與履歷</h2>
              <p className="text-sm text-gray-500">選擇選手檢視個人歷年最佳與賽事表現</p>
            </div>
          </div>
          <select value={selectedAthlete} onChange={e => setSelectedAthlete(e.target.value)} className="w-full md:w-64 p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold focus:ring-indigo-500">
            {uniqueAthletes.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {selectedAthlete && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <p className="text-xs font-semibold text-gray-400">總參賽項目</p>
                <p className="text-2xl font-black mt-1">{athleteRecords.length} <span className="text-sm font-normal text-gray-500">次</span></p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <p className="text-xs font-semibold text-gray-400">參賽賽事數</p>
                <p className="text-2xl font-black text-indigo-600 mt-1">{comps.size} <span className="text-sm font-normal text-gray-500">場</span></p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <p className="text-xs font-semibold text-gray-400">金牌數</p>
                <p className="text-2xl font-black text-amber-500 mt-1">{golds} <span className="text-sm font-normal text-gray-500">面</span></p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <p className="text-xs font-semibold text-gray-400">總獎牌數</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{medals} <span className="text-sm font-normal text-gray-500">面</span></p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Medal className="text-amber-500"/> 個人最佳紀錄 (PB)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pbCards.map(pb => (
                  <div key={pb.event} className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{pb.event}</span>
                      <p className="text-xs text-gray-500 mt-2">{pb.best.competition}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-black text-indigo-600 block">{pb.best.score}</span>
                      <span className="text-[10px] text-gray-400">出賽 {pb.count} 次</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><List className="text-gray-500"/> 參賽歷史明細</h3>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500"><th className="px-4 py-3 text-left">賽事</th><th className="px-4 py-3 text-left">項目</th><th className="px-4 py-3 text-left">成績</th><th className="px-4 py-3 text-left">名次</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {athleteRecords.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-800">{r.competition}</td><td className="px-4 py-3 font-semibold text-indigo-600">{r.event}</td><td className="px-4 py-3 font-bold">{r.score}</td>
                      <td className="px-4 py-3">{r.rank ? <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">第 {r.rank} 名</span> : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------
  // View 3: 趨勢分析
  // -------------------------------------------------------------
  const AnalyticsView = () => {
    const [chartAthlete, setChartAthlete] = useState(uniqueAthletes[0] || '');
    const athleteEvents = [...new Set(records.filter(r => r.athlete === chartAthlete).map(r => r.event))];
    const [chartEvent, setChartEvent] = useState('');

    useEffect(() => { if (!chartAthlete && uniqueAthletes.length > 0) setChartAthlete(uniqueAthletes[0]); }, [uniqueAthletes]);
    useEffect(() => { if (athleteEvents.length > 0 && !athleteEvents.includes(chartEvent)) setChartEvent(athleteEvents[0]); }, [athleteEvents, chartEvent]);

    const chartData = records
      .filter(r => r.athlete === chartAthlete && r.event === chartEvent)
      .map(r => ({ ...r, val: parseScore(r.score) }))
      .filter(r => r.val !== null);
      
    const isTrack = isTrackEvent(chartEvent);

    const CustomTooltip = ({ active, payload, label }) => {
      if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
          <div className="bg-slate-800 text-white p-3 rounded-lg shadow-xl border border-slate-600 text-sm">
            <p className="font-bold text-indigo-300 mb-1">{data.competition}</p>
            <p>成績: <span className="font-black text-lg text-white">{data.score}</span></p>
            {data.rank && <p className="text-amber-400 mt-1">名次: 第 {data.rank} 名</p>}
          </div>
        );
      }
      return null;
    };

    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><TrendingUp className="text-emerald-500"/> 選手成長趨勢分析</h2>
          <p className="text-sm text-gray-500">追蹤選手在不同賽事中的表現成長軌跡</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">選擇選手</label><select value={chartAthlete} onChange={e => setChartAthlete(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg font-bold">{uniqueAthletes.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">選擇項目</label><select value={chartEvent} onChange={e => setChartEvent(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg font-bold">{athleteEvents.map(e => <option key={e} value={e}>{e}</option>)}</select></div>
        </div>

        {chartData.length > 0 ? (
          <div className="bg-slate-900/5 p-4 rounded-2xl border border-slate-200">
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 mb-4">
              <span>項目: <strong className="text-indigo-600">{isTrack ? '徑賽 (時間越短越好，圖表自動反轉)' : '田賽 (數值越高越好)'}</strong></span>
              <span>出賽紀錄: <strong>{chartData.length} 次</strong></span>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="competition" tick={{fontSize: 12, fill: '#64748b'}} />
                  <YAxis reversed={isTrack} domain={['auto', 'auto']} tick={{fontSize: 12, fill: '#64748b'}} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="val" stroke="#4f46e5" strokeWidth={3} activeDot={{ r: 8, fill: '#4f46e5' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="text-center p-10 text-gray-400">目前選擇的選手/項目尚無足夠的資料繪製圖表</div>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------
  // View 4: 成績總覽 (CRUD)
  // -------------------------------------------------------------
  const AllRecordsView = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGender, setFilterGender] = useState(''); // 新增性別過濾
    const [filterComp, setFilterComp] = useState('');
    const [filterEvent, setFilterEvent] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    const filteredRecords = records.filter(r => {
      const matchSearch = r.athlete.includes(searchTerm) || r.competition.includes(searchTerm);
      const matchGender = !filterGender || normalizeGender(r.gender) === filterGender;
      const matchComp = !filterComp || r.competition === filterComp;
      const matchEvent = !filterEvent || r.event === filterEvent;
      return matchSearch && matchGender && matchComp && matchEvent;
    }).reverse();

    const saveEdit = async () => {
      if (!editForm.competition || !editForm.event || !editForm.athlete || !editForm.score) {
        showMessage('請填寫必填欄位', true); return;
      }
      try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'trackRecords', editingId);
        await updateDoc(docRef, { ...editForm });
        setEditingId(null);
        showMessage('紀錄更新成功');
      } catch (err) { console.error(err); showMessage('更新失敗', true); }
    };

    const deleteRec = async (id) => {
      if (!window.confirm('確定要刪除這筆紀錄嗎？資料將從雲端永久刪除。')) return;
      try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'trackRecords', id);
        await deleteDoc(docRef);
        showMessage('紀錄已刪除');
      } catch (err) { console.error(err); showMessage('刪除失敗', true); }
    };

    return (
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <div className="flex flex-col lg:flex-row justify-between mb-6 gap-4">
          <div><h2 className="text-2xl font-bold flex items-center gap-2"><List className="text-indigo-600" /> 雲端資料庫總覽</h2><p className="text-sm text-gray-500 mt-1">共 {filteredRecords.length} 筆資料</p></div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative"><Search className="absolute left-3 top-2.5 text-gray-400" size={16}/><input type="text" placeholder="搜尋..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="pl-9 pr-3 py-2 bg-gray-50 border rounded-xl text-sm w-full"/></div>
            <select value={filterGender} onChange={e=>setFilterGender(e.target.value)} className="p-2 bg-gray-50 border rounded-xl text-sm font-semibold"><option value="">所有組別</option><option value="男">男子組</option><option value="女">女子組</option></select>
            <select value={filterComp} onChange={e=>setFilterComp(e.target.value)} className="p-2 bg-gray-50 border rounded-xl text-sm"><option value="">所有賽事</option>{uniqueCompetitions.map(c=><option key={c}>{c}</option>)}</select>
            <select value={filterEvent} onChange={e=>setFilterEvent(e.target.value)} className="p-2 bg-gray-50 border rounded-xl text-sm"><option value="">所有項目</option>{uniqueEvents.map(e=><option key={e}>{e}</option>)}</select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-gray-600 font-bold">
              <tr><th className="px-6 py-3.5 text-left">組別</th><th className="px-6 py-3.5 text-left">賽事</th><th className="px-6 py-3.5 text-left">項目</th><th className="px-6 py-3.5 text-left">姓名</th><th className="px-6 py-3.5 text-left">成績</th><th className="px-6 py-3.5 text-left">名次</th><th className="px-6 py-3.5 text-right">操作</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRecords.map(r => {
                const isEditing = editingId === r.id;
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    {isEditing ? (
                      <>
                        <td className="px-4 py-3"><select className="w-full border p-1 rounded" value={editForm.gender || '男'} onChange={e=>setEditForm({...editForm, gender: e.target.value})}><option value="男">男</option><option value="女">女</option></select></td>
                        <td className="px-4 py-3"><input className="w-full border p-1 rounded" value={editForm.competition} onChange={e=>setEditForm({...editForm, competition: e.target.value})} /></td>
                        <td className="px-4 py-3"><input className="w-full border p-1 rounded" value={editForm.event} onChange={e=>setEditForm({...editForm, event: e.target.value})} /></td>
                        <td className="px-4 py-3"><input className="w-full border p-1 rounded" value={editForm.athlete} onChange={e=>setEditForm({...editForm, athlete: e.target.value})} /></td>
                        <td className="px-4 py-3"><input className="w-full border p-1 rounded" value={editForm.score} onChange={e=>setEditForm({...editForm, score: e.target.value})} /></td>
                        <td className="px-4 py-3"><input className="w-full border p-1 rounded" value={editForm.rank} onChange={e=>setEditForm({...editForm, rank: e.target.value})} /></td>
                        <td className="px-4 py-3 text-right"><button onClick={saveEdit} className="text-emerald-600 p-1"><Check size={18}/></button><button onClick={()=>setEditingId(null)} className="text-gray-400 p-1"><X size={18}/></button></td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4"><span className={`px-2 py-1 rounded-md text-xs font-bold ${normalizeGender(r.gender) === '女' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>{normalizeGender(r.gender) === '女' ? '女' : '男'}</span></td><td className="px-6 py-4">{r.competition}</td><td className="px-6 py-4 font-bold text-indigo-600">{r.event}</td><td className="px-6 py-4 font-semibold">{r.athlete}</td><td className="px-6 py-4 font-black">{r.score}</td>
                        <td className="px-6 py-4">{r.rank ? <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-xs font-bold">第 {r.rank} 名</span> : '-'}</td>
                        <td className="px-6 py-4 text-right"><button onClick={()=>{setEditingId(r.id); setEditForm(r);}} className="text-indigo-600 p-1 mr-1"><Edit2 size={16}/></button><button onClick={()=>deleteRec(r.id)} className="text-rose-500 p-1"><Trash2 size={16}/></button></td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // View 5: 新增與管理 (匯出匯入)
  // -------------------------------------------------------------
  const AddManageView = () => {
    const [formData, setFormData] = useState({ gender: '男', competition: '', event: '', athlete: '', score: '', rank: '' });
    const [adminPwd, setAdminPwd] = useState('');
    const fileInputRef = useRef(null);

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!user) { showMessage('連線錯誤，無法存檔', true); return; }
      try {
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'trackRecords');
        await addDoc(colRef, formData);
        showMessage('已成功寫入雲端資料庫！');
        setFormData({ ...formData, athlete: '', score: '', rank: '' }); // 保留賽事跟項目與組別方便連打
      } catch (err) { console.error(err); showMessage('新增失敗', true); }
    };

    const exportCSV = () => {
      const headers = ['組別', '賽事名稱', '比賽項目', '選手姓名', '成績', '名次'];
      const rows = records.map(r => [r.gender || '男', r.competition, r.event, r.athlete, r.score, r.rank || '']);
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `田徑備份_${new Date().toISOString().slice(0,10)}.csv`;
      link.click();
    };

    const importCSV = async (e) => {
      const file = e.target.files[0];
      if (!file || !user) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const text = ev.target.result.replace(/^\uFEFF/, '');
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length <= 1) { showMessage('CSV 為空或格式不符', true); return; }
        
        try {
          const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'trackRecords');
          const batch = writeBatch(db);
          let count = 0;
          
          const headerCols = lines[0].split(',').map(h => h.trim());
          const isNewFormat = headerCols[0] === '組別';

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim());
            if (isNewFormat) {
              if (cols.length >= 5 && cols[1] && cols[4]) {
                const newDocRef = doc(colRef);
                batch.set(newDocRef, { gender: cols[0], competition: cols[1], event: cols[2], athlete: cols[3], score: cols[4], rank: cols[5] || '' });
                count++;
              }
            } else {
              // 兼容舊版 5 欄位的 CSV 備份
              if (cols.length >= 4 && cols[0] && cols[3]) {
                const newDocRef = doc(colRef);
                batch.set(newDocRef, { gender: '男', competition: cols[0], event: cols[1], athlete: cols[2], score: cols[3], rank: cols[4] || '' });
                count++;
              }
            }
          }
          await batch.commit();
          showMessage(`成功將 ${count} 筆資料匯入雲端！`);
        } catch (err) {
          console.error(err); showMessage('匯入過程發生錯誤', true);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
    };

    const handleDeleteAll = async () => {
      if (!user) { showMessage('連線錯誤，無法執行', true); return; }
      if (records.length === 0) { showMessage('目前沒有任何資料可以清空', true); return; }

      const firstConfirm = window.confirm('⚠️ 警告：您即將刪除雲端「所有」成績資料！\n\n此操作完全無法復原，強烈建議您先點擊上方「匯出 CSV」進行備份。\n您確定要繼續嗎？');
      if (!firstConfirm) return;

      try {
        const batch = writeBatch(db);
        records.forEach(r => {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'trackRecords', r.id);
          batch.delete(docRef);
        });
        await batch.commit();
        showMessage('✅ 所有資料已成功從雲端清空！');
      } catch (err) {
        console.error(err);
        showMessage('清空失敗，請檢查網路連線', true);
      }
    };

    if (!isAdminAuth) {
      return (
        <div className="bg-white rounded-2xl shadow-sm p-8 border border-gray-100 max-w-sm mx-auto mt-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4"><Lock size={32}/></div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">系統管理區</h2>
          <p className="text-sm text-gray-500 mb-6">請輸入管理員密碼以進入新增與備份系統</p>
          <form className="w-full" onSubmit={(e) => {
            e.preventDefault();
            if (adminPwd === 'admin888') {
              setIsAdminAuth(true);
              setAdminPwd('');
              showMessage('登入成功');
            } else {
              showMessage('密碼錯誤', true);
              setAdminPwd('');
            }
          }}>
            <input type="password" value={adminPwd} onChange={e => setAdminPwd(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl mb-4 text-center font-bold focus:ring-2 focus:ring-indigo-500" placeholder="請輸入密碼" />
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">登入管理</button>
          </form>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><PlusCircle className="text-indigo-600"/> 新增成績至雲端</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">組別 *</label><select required className="w-full p-2.5 border rounded-xl bg-white font-semibold text-gray-700" value={formData.gender} onChange={e=>setFormData({...formData, gender: e.target.value})}><option value="男">男子組</option><option value="女">女子組</option></select></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">賽事名稱 *</label><input required list="dl-comps" className="w-full p-2.5 border rounded-xl" value={formData.competition} onChange={e=>setFormData({...formData, competition: e.target.value})}/><datalist id="dl-comps">{uniqueCompetitions.map(c=><option key={c} value={c}/>)}</datalist></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">比賽項目 *</label><input required list="dl-evts" className="w-full p-2.5 border rounded-xl" value={formData.event} onChange={e=>setFormData({...formData, event: e.target.value})}/><datalist id="dl-evts">{uniqueEvents.map(c=><option key={c} value={c}/>)}</datalist></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">選手姓名 *</label><input required list="dl-aths" className="w-full p-2.5 border rounded-xl" value={formData.athlete} onChange={e=>setFormData({...formData, athlete: e.target.value})}/><datalist id="dl-aths">{uniqueAthletes.map(c=><option key={c} value={c}/>)}</datalist></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">成績 * (失敗填X)</label><input required className="w-full p-2.5 border rounded-xl" placeholder="如 12.34 或 1:10.34" value={formData.score} onChange={e=>setFormData({...formData, score: e.target.value})}/></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">大會名次 (選填)</label><input className="w-full p-2.5 border rounded-xl" value={formData.rank} onChange={e=>setFormData({...formData, rank: e.target.value})}/></div>
            </div>
            <button type="submit" disabled={!user} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold py-3.5 rounded-xl shadow-md flex justify-center items-center gap-2 transition"><Save size={18}/> 儲存成績</button>
          </form>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Download className="text-emerald-500"/> 資料備份與轉移</h3>
            <p className="text-xs text-gray-500 mb-6 leading-relaxed">資料已安全儲存於 Firebase 雲端。您可以匯出備份，或批量匯入歷史資料 (將附加至現有庫中)。</p>
            <div className="space-y-3">
              <button onClick={exportCSV} className="w-full bg-emerald-50 text-emerald-700 font-bold py-2.5 px-4 rounded-xl border border-emerald-200 text-sm flex justify-center items-center gap-2"><Download size={16}/> 匯出 CSV 資料檔</button>
              <label className="w-full bg-blue-50 text-blue-700 font-bold py-2.5 px-4 rounded-xl border border-blue-200 text-sm flex justify-center items-center gap-2 cursor-pointer">
                <Upload size={16}/> 批量匯入 CSV 資料
                <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={importCSV} />
              </label>
            </div>
            
            <div className="mt-6 pt-5 border-t border-rose-100">
              <h3 className="text-rose-600 font-bold mb-2 flex items-center gap-1.5"><AlertCircle size={16} /> 危險區域 (Danger Zone)</h3>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">清空雲端所有的成績紀錄。此動作不可逆，請務必先執行上方的匯出備份。</p>
              <button onClick={handleDeleteAll} className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-2.5 px-4 rounded-xl border border-rose-200 text-sm flex justify-center items-center gap-2 transition">
                <Trash2 size={16}/> 永久清空所有資料
              </button>
            </div>
          </div>
          <div className="mt-8 p-4 bg-slate-50 rounded-xl text-xs text-slate-500 border border-slate-100"><p className="font-semibold text-slate-700 mb-1">雲端連線狀態：</p>{user ? <span className="text-emerald-600 font-bold flex items-center gap-1">🟢 已連線至資料庫</span> : <span className="text-amber-500 font-bold flex items-center gap-1">🟡 連線中...</span>}</div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // 主畫面與導覽列
  // -------------------------------------------------------------
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12">
      {/* Toast Notification */}
      {toastMsg.show && (
        <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-2xl shadow-xl z-50 text-white font-bold text-sm flex items-center gap-2 animate-bounce ${toastMsg.isError ? 'bg-rose-600' : 'bg-emerald-600'}`}>
          {toastMsg.isError ? <AlertCircle size={18}/> : <Check size={18}/>} {toastMsg.msg}
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-inner"><Trophy size={20} className="text-yellow-300"/></div>
            <div>
              <h1 className="text-lg font-black tracking-wide">校園田徑隊成績管理 (Cloud 版)</h1>
              <p className="text-[10px] text-slate-400 hidden sm:block">Firebase Firestore 雲端同步系統</p>
            </div>
          </div>
          <div className="text-xs bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-full text-slate-300 flex items-center">
            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${user ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
            {user ? '雲端連線中' : '斷線'}
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b sticky top-16 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-2 overflow-x-auto py-2.5 no-scrollbar">
          {[
            { id: 'best', icon: Trophy, label: '歷年最佳' },
            { id: 'athletes', icon: User, label: '選手檔案' },
            { id: 'analytics', icon: TrendingUp, label: '趨勢圖表' },
            { id: 'all', icon: List, label: '成績總覽' },
            { id: 'add', icon: PlusCircle, label: '新增/管理' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl whitespace-nowrap transition ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {activeTab === 'best' && <BestRecordsView />}
        {activeTab === 'athletes' && <AthleteProfileView />}
        {activeTab === 'analytics' && <AnalyticsView />}
        {activeTab === 'all' && <AllRecordsView />}
        {activeTab === 'add' && <AddManageView />}
      </main>
    </div>
  );
}