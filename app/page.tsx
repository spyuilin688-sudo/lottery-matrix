import React from 'react';

export default function Home() {
  return (
    <main className="min-h-screen w-full flex justify-center bg-[#06090e] text-white antialiased">
      {/* 限制手機版 390px 寬度外殼 */}
      <div className="w-full max-w-[390px] px-4 pb-20 flex flex-col">
        
        {/* 頂部標題區 */}
        <div className="w-full text-center pt-4 pb-1">
          <h1 className="text-[20px] font-extrabold tracking-wider bg-gradient-to-b from-white to-[#dcb365] bg-clip-text text-transparent m-0">
            Ｍ 樂彩 Matrix
          </h1>
          <p className="text-[15px] text-white font-normal tracking-[2px] mt-1">
            Matrix 探索
          </p>
        </div>

        {/* 探索設定區塊 */}
        <div className="border border-[#dcb365]/25 rounded-[6px] bg-transparent p-3 mt-3.5">
          <div className="flex items-center gap-1.5 mb-3 text-[14px] font-bold text-[#dcb365] before:content-[''] before:w-[3px] before:height-[13px] before:rounded-[1px] before:bg-[#dcb365]">
            探索設定
          </div>
          <div className="flex flex-col gap-3">
            {/* 彩種 */}
            <div className="grid grid-cols-[85px_1fr] gap-2 items-center">
              <span className="text-[#a0aab5] text-[13px] font-medium">彩種</span>
              <div className="h-8 border border-[#dcb365]/25 rounded-[6px] bg-[#0a0f1a]/60 text-white text-[12px] px-3 flex items-center justify-between cursor-pointer">
                <span>今彩539</span>
                <span className="w-0 height-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-[5px] border-t-[#dcb365]"></span>
              </div>
            </div>
            {/* 探索期數 */}
            <div className="grid grid-cols-[85px_1fr] gap-2 items-center">
              <span className="text-[#a0aab5] text-[13px] font-medium">探索期數</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" className="h-8 border border-[#dcb365]/25 rounded-[6px] bg-[#0a0f1a]/30 text-white text-[12px]">二期</button>
                <button type="button" className="h-8 border border-[#dcb365]/25 rounded-[6px] bg-[#0a0f1a]/30 text-white text-[12px]">七期</button>
                <button type="button" className="h-8 border border-[#dcb365] rounded-[6px] bg-gradient-to-b from-[#dcb365] to-[#b58c43] text-[#06090e] text-[12px] font-bold relative after:content-['Matrix_Pro'] after:absolute after:-top-[7px] after:-right-[2px] after:bg-[#dcb365]/20 after:text-[#dcb365] after:text-[7px] after:px-1 after:rounded-[3px] scale-[1.0] after:scale-[0.8]">十三期</button>
              </div>
            </div>
            {/* 版路類型 */}
            <div className="grid grid-cols-[85px_1fr] gap-2 items-center">
              <span className="text-[#a0aab5] text-[13px] font-medium">版路類型</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" className="h-8 border border-[#dcb365] rounded-[6px] bg-gradient-to-b from-[#dcb365] to-[#b58c43] text-[#06090e] text-[12px] font-bold">加減版路</button>
                <button type="button" className="h-8 border border-[#dcb365]/25 rounded-[6px] bg-[#0a0f1a]/30 text-white text-[12px]">合值版路</button>
                <button type="button" className="h-8 border border-[#dcb365]/25 rounded-[6px] bg-[#0a0f1a]/30 text-white text-[12px] relative after:content-['推薦'] after:absolute after:-top-[7px] after:-right-[2px] after:bg-[#f18d00]/20 after:text-[#f18d00] after:text-[7px] after:px-1 after:rounded-[3px] after:scale-[0.8]">拖牌版路</button>
              </div>
            </div>
          </div>
        </div>

        {/* 命中條件 */}
        <div className="border border-[#dcb365]/25 rounded-[6px] bg-transparent p-3 mt-3.5">
          <div className="flex items-center gap-1.5 mb-3 text-[14px] font-bold text-[#dcb365] before:content-[''] before:w-[3px] before:height-[13px] before:rounded-[1px] before:bg-[#dcb365]">
            命中條件
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button type="button" className="h-[34px] border border-[#dcb365] rounded-[6px] bg-gradient-to-b from-[#dcb365] to-[#b58c43] text-[#06090e] text-[12px] font-bold">準4+ (鎖定1碼)</button>
            <button type="button" className="h-[34px] border border-[#dcb365]/25 rounded-[6px] bg-[#0a0f1a]/60 text-white text-[12px] font-bold">準5+ (鎖定2碼)</button>
          </div>
          <div className="flex items-center justify-between text-[13px] text-[#a0aab5] cursor-pointer pt-1">
            <span className="text-[#dcb365] font-bold">🔒 進階探索設定</span>
            <span className="w-1.5 h-1.5 border-r border-b border-[#dcb365] transform rotate-[-45deg]"></span>
          </div>
        </div>

        {/* 開始探索按鈕 */}
        <button type="button" className="w-full h-[38px] mt-3.5 border border-[#dcb365] rounded-[6px] bg-[#0a0f1a]/40 text-[#dcb365] text-[15px] font-bold flex items-center justify-center gap-1.5 cursor-pointer">
          🔍 開始探索
        </button>

        {/* 近10期開獎號碼 */}
        <div className="border border-[#dcb365]/25 rounded-[6px] bg-transparent p-2.5 px-3 mt-3.5">
          <div className="flex justify-between items-center pb-2.5">
            <h2 className="m-0 text-[13px] font-bold text-[#dcb365]">
              近10期開獎號碼 <span className="text-[#a0aab5] text-[10px] font-normal">(依號碼由小到大排序)</span>
            </h2>
            <a href="#" className="text-[#a0aab5] text-[12px] no-underline">查看更多紀錄 &gt;</a>
          </div>
          <div className="w-full text-center text-[13px]">
            <div className="grid grid-cols-[60px_80px_1fr] py-2 text-[#a0aab5] text-[12px] border-b border-[#dcb365]/25">
              <div>期數</div><div>日期</div><div>開獎號碼</div>
            </div>
            {/* 期數列範例 */}
            {[
              { p: '115195', d: '2026/08/12', b: ['07', '12', '17', '20', '32'] },
              { p: '115194', d: '2026/08/11', b: ['07', '17', '19', '23', '30'] },
              { p: '115193', d: '2026/08/10', b: ['01', '07', '16', '23', '35'] },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-[60px_80px_1fr] py-2.5 items-center border-b border-white/5 last:border-0">
                <div>{row.p}</div>
                <div className="text-[#a0aab5] text-[12px]">{row.d}</div>
                <div className="flex gap-1.25 justify-center">
                  {row.b.map((ball, bi) => (
                    <span key={bi} className="w-[25px] h-[25px] bg-[#f18d00] text-black font-extrabold rounded-full flex items-center justify-center underline text-[13px] shadow-none">
                      {ball}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 重複號碼統計 */}
        <div className="border border-[#dcb365]/25 rounded-[6px] bg-transparent p-3 mt-3.5">
          <div className="flex items-center gap-1.5 mb-3 text-[14px] font-bold text-[#dcb365] before:content-[''] before:w-[3px] before:height-[13px] before:rounded-[1px] before:bg-[#dcb365]">
            重複號碼統計 <span className="text-[10px] bg-white/10 px-1 py-[1px] rounded-[3px] text-[#a0aab5] font-normal ml-1.5">十期</span>
          </div>
          <div className="grid grid-cols-6 gap-1.5 text-center">
            {[
              { n: '38', c: '56次' }, { n: '09', c: '55次' }, { n: '08', c: '55次' },
              { n: '32', c: '52次' }, { n: '03', c: '51次' }, { n: '36', color: '50次' },
              { n: '18', c: '51次' }, { n: '29', c: '51次' }, { n: '12', c: '51次' },
              { n: '17', c: '50次' }, { n: '21', c: '48次' }, { n: '28', c: '48次' }
            ].map((item, i) => (
              <div key={i} className="border border-white/5 bg-white/[0.02] rounded-[4px] py-1.5">
                <div className="text-[14px] font-bold text-white">{item.n}</div>
                <div className="text-[10px] text-[#a0aab5] mt-0.5">{item.c || '50次'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部免責聲明 */}
        <p className="text-[11px] text-white/30 text-center mt-4 leading-[16px]">
          探索結果單純原創演算拆解產生，僅供參考之用，不保證與現實雙重符合。
        </p>
      </div>

      {/* 固定底部導覽列 */}
      <div className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-[390px] h-[60px] bg-[#06090e] border-t border-[#dcb365]/25 grid grid-cols-4 items-center text-center z-50">
        <a href="#" className="flex flex-col items-center text-[#dcb365] text-[11px] font-bold gap-1">
          <span className="w-5 h-5 bg-current opacity-100"></span>
          <span>首頁</span>
        </a>
        <a href="#" className="flex flex-col items-center text-[#a0aab5] text-[11px] gap-1">
          <span className="w-5 h-5 bg-current opacity-30"></span>
          <span>快捷</span>
        </a>
        <a href="#" className="flex flex-col items-center text-[#a0aab5] text-[11px] gap-1">
          <span className="w-5 h-5 bg-current opacity-30"></span>
          <span>通知</span>
        </a>
        <a href="#" className="flex flex-col items-center text-[#a0aab5] text-[11px] gap-1">
          <span className="w-5 h-5 bg-current opacity-30"></span>
          <span>我的</span>
        </a>
      </div>
    </main>
  );
}
