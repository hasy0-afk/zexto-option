// ============================================
// SUPPORT PANEL COMPONENT — Add this to App.jsx
// ============================================
// Place this function BEFORE the TradingPage function in your App.jsx
// (after HelpPanel, before RegisterPage)

function SupportPanel({open,onClose,T,currentUser}){
  const[view,setView]=useState("list"); // list | create | detail
  const[tickets,setTickets]=useState([]);
  const[loading,setLoading]=useState(false);
  const[selectedTicket,setSelectedTicket]=useState(null);
  const[replyText,setReplyText]=useState("");
  const[sending,setSending]=useState(false);
  // Create form
  const[subject,setSubject]=useState("");
  const[category,setCategory]=useState("other");
  const[priority,setPriority]=useState("medium");
  const[message,setMessage]=useState("");
  const[files,setFiles]=useState([]);
  const[creating,setCreating]=useState(false);

  const CATEGORIES=[
    {v:"deposit",l:"💰 Deposit"},
    {v:"withdrawal",l:"💸 Withdrawal"},
    {v:"trading",l:"📈 Trading"},
    {v:"account",l:"👤 Account"},
    {v:"kyc",l:"🔒 KYC Verification"},
    {v:"technical",l:"⚙️ Technical Issue"},
    {v:"other",l:"📝 Other"}
  ];
  const PRIORITIES=[
    {v:"low",l:"Low",c:"#4a5570"},
    {v:"medium",l:"Medium",c:"#3b82f6"},
    {v:"high",l:"High",c:"#eab308"},
    {v:"urgent",l:"Urgent",c:"#ef4444"}
  ];
  const STATUS_COLORS={open:"#3b82f6",in_progress:"#eab308",awaiting_reply:"#22c55e",resolved:"#7a85a0",closed:"#4a5570"};
  const STATUS_LABELS={open:"Open",in_progress:"In Progress",awaiting_reply:"Awaiting Reply",resolved:"Resolved",closed:"Closed"};

  // Load tickets
  useEffect(()=>{
    if(!open)return;
    loadTickets();
  },[open]);

  const loadTickets=async()=>{
    setLoading(true);
    try{
      const res=await API.support.list();
      if(res.success)setTickets(res.tickets||[]);
    }catch(e){console.error(e);}
    setLoading(false);
  };

  const openTicket=async(t)=>{
    try{
      const res=await API.support.get(t._id);
      if(res.success){setSelectedTicket(res.ticket);setView("detail");}
    }catch(e){console.error(e);}
  };

  const handleCreate=async()=>{
    if(!subject.trim()||!message.trim())return;
    setCreating(true);
    try{
      const fd=new FormData();
      fd.append("subject",subject);
      fd.append("category",category);
      fd.append("priority",priority);
      fd.append("message",message);
      files.forEach(f=>fd.append("attachments",f));
      const res=await API.support.create(fd);
      if(res.success){
        setSubject("");setMessage("");setCategory("other");setPriority("medium");setFiles([]);
        setView("list");loadTickets();
      }
    }catch(e){console.error(e);}
    setCreating(false);
  };

  const handleReply=async()=>{
    if(!replyText.trim()||!selectedTicket)return;
    setSending(true);
    try{
      const fd=new FormData();
      fd.append("message",replyText);
      const res=await API.support.reply(selectedTicket._id,fd);
      if(res.success){setSelectedTicket(res.ticket);setReplyText("");}
    }catch(e){console.error(e);}
    setSending(false);
  };

  const handleClose=async()=>{
    if(!selectedTicket||!confirm("Close this ticket?"))return;
    try{
      const res=await API.support.close(selectedTicket._id);
      if(res.success){setSelectedTicket(res.ticket);loadTickets();}
    }catch(e){console.error(e);}
  };

  const inp={background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",color:T.text,fontSize:12,width:"100%",outline:"none",boxSizing:"border-box",resize:"vertical",fontFamily:"'DM Sans',sans-serif"};
  const sel={...inp,appearance:"none",cursor:"pointer"};

  const timeAgo=(d)=>{const ms=Date.now()-new Date(d).getTime();const m=Math.floor(ms/60000);if(m<1)return"Just now";if(m<60)return m+"m ago";const h=Math.floor(m/60);if(h<24)return h+"h ago";const dy=Math.floor(h/24);return dy+"d ago";};

  return(<SlidePanel T={T} open={open} onClose={()=>{onClose();setView("list");setSelectedTicket(null);}} title={view==="create"?"New Ticket":view==="detail"?"Ticket Details":"Support"}>
    <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>

      {/* ===== LIST VIEW ===== */}
      {view==="list"&&<>
        <div style={{padding:"12px 20px",borderBottom:`1px solid ${T.border}`}}>
          <button onClick={()=>setView("create")} style={{width:"100%",padding:"11px 0",borderRadius:8,border:"none",background:`linear-gradient(135deg,${T.accent},#00cc7d)`,color:T.bg,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            New Support Ticket
          </button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px 16px"}}>
          {loading?<div style={{textAlign:"center",padding:30,color:T.muted,fontSize:12}}>Loading...</div>
          :tickets.length===0?<div style={{textAlign:"center",padding:40}}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.2" strokeLinecap="round" style={{marginBottom:10}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <div style={{fontSize:13,color:T.sub,fontWeight:600,marginBottom:4}}>No tickets yet</div>
            <div style={{fontSize:11,color:T.muted}}>Create a ticket to get help from our support team</div>
          </div>
          :tickets.map(t=>(
            <button key={t._id} onClick={()=>openTicket(t)} style={{display:"flex",flexDirection:"column",gap:6,padding:"12px 14px",marginBottom:6,borderRadius:10,background:T.el,border:`1px solid ${T.border}`,cursor:"pointer",width:"100%",textAlign:"left",transition:"border-color 0.2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent+"55"} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%"}}>
                <span style={{fontSize:11,fontWeight:700,color:T.text,fontFamily:"'DM Sans',sans-serif",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.subject}</span>
                <span style={{fontSize:8,fontWeight:600,padding:"2px 6px",borderRadius:4,background:STATUS_COLORS[t.status]+"22",color:STATUS_COLORS[t.status],flexShrink:0,marginLeft:8,fontFamily:"'Inter',sans-serif"}}>{STATUS_LABELS[t.status]||t.status}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:9,color:T.muted,fontFamily:"'Inter',sans-serif"}}>{t.ticketId}</span>
                  <span style={{fontSize:9,color:T.muted}}>•</span>
                  <span style={{fontSize:9,color:PRIORITIES.find(p=>p.v===t.priority)?.c||T.muted,fontWeight:600,fontFamily:"'Inter',sans-serif"}}>{t.priority?.toUpperCase()}</span>
                </div>
                <span style={{fontSize:9,color:T.muted,fontFamily:"'Inter',sans-serif"}}>{timeAgo(t.updatedAt||t.createdAt)}</span>
              </div>
            </button>
          ))}
        </div>
      </>}

      {/* ===== CREATE VIEW ===== */}
      {view==="create"&&<div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
        <button onClick={()=>setView("list")} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"'DM Sans',sans-serif",padding:0}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          Back to tickets
        </button>
        <div>
          <div style={{fontSize:10,color:T.sub,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".04em",fontFamily:"'DM Sans',sans-serif"}}>Subject *</div>
          <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Brief description of your issue..." style={inp} maxLength={200}/>
        </div>
        <div style={{display:"flex",gap:10}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:T.sub,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".04em",fontFamily:"'DM Sans',sans-serif"}}>Category</div>
            <select value={category} onChange={e=>setCategory(e.target.value)} style={sel}>
              {CATEGORIES.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:T.sub,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".04em",fontFamily:"'DM Sans',sans-serif"}}>Priority</div>
            <select value={priority} onChange={e=>setPriority(e.target.value)} style={sel}>
              {PRIORITIES.map(p=><option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div style={{fontSize:10,color:T.sub,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".04em",fontFamily:"'DM Sans',sans-serif"}}>Message *</div>
          <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Describe your issue in detail..." style={{...inp,minHeight:100}} rows={5}/>
        </div>
        <div>
          <div style={{fontSize:10,color:T.sub,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".04em",fontFamily:"'DM Sans',sans-serif"}}>Attachments (max 3)</div>
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px 0",borderRadius:8,border:`1px dashed ${T.border}`,background:"transparent",color:T.sub,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.color=T.accent;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.sub;}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            {files.length>0?`${files.length} file(s) selected`:"Attach screenshots or files"}
            <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt" onChange={e=>{const f=Array.from(e.target.files||[]).slice(0,3);setFiles(f);}} style={{display:"none"}}/>
          </label>
          {files.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>
            {files.map((f,i)=><span key={i} style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:T.el,border:`1px solid ${T.border}`,color:T.sub,display:"flex",alignItems:"center",gap:3}}>
              📎 {f.name.slice(0,20)}{f.name.length>20?"...":""}
              <span onClick={()=>setFiles(files.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.red,fontSize:11}}>×</span>
            </span>)}
          </div>}
        </div>
        <button onClick={handleCreate} disabled={creating||!subject.trim()||!message.trim()} style={{width:"100%",padding:"12px 0",borderRadius:8,border:"none",background:(!subject.trim()||!message.trim())?T.el:`linear-gradient(135deg,${T.accent},#00cc7d)`,color:(!subject.trim()||!message.trim())?T.muted:T.bg,fontSize:13,fontWeight:700,cursor:(!subject.trim()||!message.trim())?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:creating?.6:1}}>
          {creating?"Submitting...":"Submit Ticket"}
        </button>
      </div>}

      {/* ===== DETAIL VIEW ===== */}
      {view==="detail"&&selectedTicket&&<>
        <div style={{padding:"10px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",flexDirection:"column",gap:6}}>
          <button onClick={()=>{setView("list");setSelectedTicket(null);}} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"'DM Sans',sans-serif",padding:0}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
            Back
          </button>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:14,fontWeight:700,color:T.text,fontFamily:"'DM Sans',sans-serif",flex:1}}>{selectedTicket.subject}</span>
            <span style={{fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:5,background:STATUS_COLORS[selectedTicket.status]+"22",color:STATUS_COLORS[selectedTicket.status],fontFamily:"'Inter',sans-serif"}}>{STATUS_LABELS[selectedTicket.status]}</span>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:9,color:T.muted,fontFamily:"'Inter',sans-serif"}}>{selectedTicket.ticketId}</span>
            <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:T.el,color:T.sub,fontFamily:"'Inter',sans-serif"}}>{CATEGORIES.find(c=>c.v===selectedTicket.category)?.l||selectedTicket.category}</span>
            <span style={{fontSize:9,color:PRIORITIES.find(p=>p.v===selectedTicket.priority)?.c,fontWeight:600,fontFamily:"'Inter',sans-serif"}}>{selectedTicket.priority?.toUpperCase()}</span>
          </div>
        </div>
        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>
          {(selectedTicket.messages||[]).map((msg,i)=>(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:msg.sender==="admin"?"flex-start":"flex-end"}}>
              <div style={{maxWidth:"85%",padding:"10px 14px",borderRadius:msg.sender==="admin"?"12px 12px 12px 2px":"12px 12px 2px 12px",background:msg.sender==="admin"?T.el:`${T.accent}18`,border:`1px solid ${msg.sender==="admin"?T.border:T.accent+"33"}`}}>
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                  <span style={{fontSize:10,fontWeight:600,color:msg.sender==="admin"?"#3b82f6":T.accent,fontFamily:"'DM Sans',sans-serif"}}>{msg.sender==="admin"?"🛡️ Support":"You"}</span>
                  <span style={{fontSize:8,color:T.muted,fontFamily:"'Inter',sans-serif"}}>{timeAgo(msg.createdAt)}</span>
                </div>
                <div style={{fontSize:12,color:T.text,lineHeight:1.5,fontFamily:"'DM Sans',sans-serif",whiteSpace:"pre-wrap"}}>{msg.text}</div>
                {msg.attachments?.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>
                  {msg.attachments.map((a,j)=><a key={j} href={`http://localhost:5000${a}`} target="_blank" rel="noopener noreferrer" style={{fontSize:9,padding:"3px 8px",borderRadius:4,background:T.card,border:`1px solid ${T.border}`,color:T.accent,textDecoration:"none",fontFamily:"'Inter',sans-serif"}}>📎 Attachment {j+1}</a>)}
                </div>}
              </div>
            </div>
          ))}
        </div>
        {/* Reply input */}
        {selectedTicket.status!=="closed"?<div style={{padding:"10px 16px",borderTop:`1px solid ${T.border}`,background:T.card}}>
          <div style={{display:"flex",gap:8}}>
            <textarea value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="Type your reply..." style={{...inp,minHeight:40,flex:1,resize:"none"}} rows={2} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleReply();}}}/>
            <button onClick={handleReply} disabled={sending||!replyText.trim()} style={{width:38,height:38,borderRadius:8,border:"none",background:!replyText.trim()?T.el:`linear-gradient(135deg,${T.accent},#00cc7d)`,color:!replyText.trim()?T.muted:T.bg,cursor:!replyText.trim()?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,alignSelf:"flex-end"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:6}}>
            <button onClick={handleClose} style={{fontSize:10,color:T.red,background:"transparent",border:"none",cursor:"pointer",fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>Close Ticket</button>
          </div>
        </div>
        :<div style={{padding:"12px 16px",borderTop:`1px solid ${T.border}`,textAlign:"center"}}>
          <span style={{fontSize:11,color:T.muted,fontFamily:"'DM Sans',sans-serif"}}>This ticket has been closed</span>
        </div>}
      </>}
    </div>
  </SlidePanel>);
}

// ============================================
// HOW TO INTEGRATE INTO App.jsx:
// ============================================
//
// 1. Add state in TradingPage:
//    const[supportOpen,setSupportOpen]=useState(false);
//
// 2. Add SupportPanel in TradingPage return (after HelpPanel):
//    <SupportPanel open={supportOpen} onClose={()=>setSupportOpen(false)} T={T} currentUser={currentUser}/>
//
// 3. Add "Support" button in sidebar NAV or profile dropdown:
//    {label:"Support",icon:"🎫",action:()=>{setProfileOpen(false);setSupportOpen(true);}}
//
// 4. Or add in HelpPanel as a button that opens support:
//    <button onClick={()=>{onClose();setSupportOpen(true);}}>Submit Ticket</button>
