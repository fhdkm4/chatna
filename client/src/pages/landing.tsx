import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ChatnaLogo } from "@/components/chatna-logo";

export default function LandingPage() {
  const [, navigate] = useLocation();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      navRef.current?.classList.toggle("scrolled", window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("rv-on"); }),
      { threshold: 0.08 }
    );
    document.querySelectorAll(".rv").forEach((el) => observer.observe(el));

    return () => {
      window.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    };
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="landing-root" dir="rtl">
      <style>{`
        .landing-root {
          --bg:#050509;--bg2:#0a0a12;--bg3:#12121e;
          --surface:rgba(255,255,255,0.03);--surface2:rgba(255,255,255,0.06);
          --border:rgba(255,255,255,0.06);--border2:rgba(255,255,255,0.1);
          --g1:#57AB37;--g2:#6DBF4D;--g3:#4A9230;
          --accent:rgba(87,171,55,0.12);
          --text:#eef2f6;--text2:#b0b8c8;--text3:#8892a4;
          font-family:'IBM Plex Sans Arabic',sans-serif;
          background:var(--bg);color:var(--text);overflow-x:hidden;-webkit-font-smoothing:antialiased;
          min-height:100vh;
        }
        .landing-root ::selection{background:var(--g1);color:#000}

        .l-nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:20px 48px;transition:all .4s;background:rgba(15,23,42,0.6);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.05)}
        .l-nav.scrolled{padding:14px 48px;background:rgba(15,23,42,0.85);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-bottom:1px solid rgba(255,255,255,0.08)}
        .nav-in{max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
        .l-logo{font-size:1.5rem;font-weight:900;color:var(--text);text-decoration:none;letter-spacing:-0.5px}
        .l-logo span{color:var(--g1)}
        .l-logo img,.l-logo .logo{height:56px;width:auto;object-fit:contain;background:transparent;mix-blend-mode:lighten;filter:brightness(1.1) drop-shadow(0 0 10px rgba(87,171,55,0.35))}
        .nav-r{display:flex;gap:12px;align-items:center}
        .nav-lnk{color:var(--text2);text-decoration:none;font-size:.85rem;font-weight:500;padding:8px 16px;border-radius:8px;transition:all .3s;cursor:pointer;background:none;border:none;font-family:inherit}
        .nav-lnk:hover{color:var(--text)}
        .l-btn{padding:10px 24px;border-radius:10px;font-family:inherit;font-size:.85rem;font-weight:700;cursor:pointer;transition:all .3s;border:none}
        .l-btn-o{background:transparent;border:1px solid var(--border2);color:var(--text)}
        .l-btn-o:hover{border-color:var(--g1);color:var(--g1)}
        .l-btn-f{background:var(--g1);color:#050509;box-shadow:0 0 30px rgba(87,171,55,0.2)}
        .l-btn-f:hover{transform:translateY(-2px);box-shadow:0 0 50px rgba(87,171,55,0.3)}

        .glow-top{position:absolute;top:-300px;right:50%;transform:translateX(50%);width:800px;height:600px;background:radial-gradient(ellipse,rgba(87,171,55,0.07),transparent 70%);pointer-events:none}
        .glow-side{position:absolute;top:50%;left:-200px;width:400px;height:800px;background:radial-gradient(ellipse,rgba(87,171,55,0.04),transparent 70%);pointer-events:none}

        .hero{min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:140px 24px 80px;position:relative;overflow:hidden}
        .hero-in{max-width:820px;position:relative;z-index:1}
        .hero-tag{display:inline-flex;align-items:center;gap:8px;padding:7px 18px;border:1px solid var(--border2);border-radius:100px;font-size:.75rem;font-weight:600;color:var(--text2);margin-bottom:32px;backdrop-filter:blur(10px);background:var(--surface)}
        .hero-tag .dot{width:6px;height:6px;background:var(--g1);border-radius:50%;box-shadow:0 0 10px var(--g1)}
        .hero h1{font-size:clamp(2.4rem,5.5vw,4.2rem);font-weight:900;line-height:1.15;letter-spacing:-1px;margin-bottom:24px}
        .hero h1 .hl{position:relative;display:inline-block}
        .hero h1 .hl::after{content:'';position:absolute;bottom:4px;right:0;left:0;height:12px;background:linear-gradient(90deg,var(--g1),var(--g2));opacity:.15;border-radius:4px}
        .hero p{font-size:1.15rem;color:var(--text2);line-height:1.9;margin-bottom:40px;max-width:600px;margin-left:auto;margin-right:auto}
        .hero-btns{display:flex;gap:14px;justify-content:center;margin-bottom:56px}
        .btn-hero{padding:15px 36px;border-radius:12px;font-size:1rem;font-weight:700;font-family:inherit;cursor:pointer;transition:all .3s;border:none}
        .btn-hero-g{background:var(--g1);color:#050509;box-shadow:0 4px 30px rgba(87,171,55,0.25)}
        .btn-hero-g:hover{transform:translateY(-3px);box-shadow:0 8px 50px rgba(87,171,55,0.35)}
        .btn-hero-o{background:var(--surface2);color:var(--text);border:1px solid var(--border2)}
        .btn-hero-o:hover{border-color:rgba(255,255,255,0.2)}
        .metrics{display:flex;gap:1px;justify-content:center;background:var(--border);border-radius:16px;overflow:hidden;border:1px solid var(--border)}
        .metric{flex:1;padding:24px 32px;background:var(--bg);text-align:center;min-width:140px}
        .metric-n{font-size:1.8rem;font-weight:900;color:var(--g1);margin-bottom:4px}
        .metric-l{font-size:.75rem;color:var(--text3);font-weight:500}

        .mockup-wrap{padding:0 24px 120px;display:flex;justify-content:center}
        .mockup{max-width:1060px;width:100%;border-radius:16px;border:1px solid var(--border2);overflow:hidden;background:var(--bg2);box-shadow:0 40px 100px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,0.03)}
        .mk-bar{display:flex;gap:7px;padding:14px 18px;background:var(--bg3);border-bottom:1px solid var(--border)}
        .mk-dot{width:10px;height:10px;border-radius:50%;background:var(--border2)}
        .mk-body{display:flex;height:420px}
        .mk-sidebar{width:300px;border-left:1px solid var(--border);padding:16px;overflow:hidden}
        .mk-item{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:10px;margin-bottom:4px;transition:background .2s}
        .mk-item:hover,.mk-item.on{background:var(--surface2)}
        .mk-item.on{border:1px solid rgba(87,171,55,0.1)}
        .mk-av{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;flex-shrink:0}
        .mk-av-g{background:linear-gradient(135deg,var(--g1),var(--g3))}
        .mk-av-b{background:linear-gradient(135deg,#3b82f6,#1d4ed8)}
        .mk-av-a{background:linear-gradient(135deg,#f59e0b,#d97706)}
        .mk-av-p{background:linear-gradient(135deg,#a855f7,#7c3aed)}
        .mk-info{flex:1;overflow:hidden}
        .mk-name{font-size:.8rem;font-weight:700}
        .mk-msg{font-size:.7rem;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mk-badge{padding:3px 8px;border-radius:6px;font-size:.6rem;font-weight:700}
        .mk-badge-ai{background:var(--accent);color:var(--g1)}
        .mk-badge-vip{background:rgba(245,158,11,0.12);color:#f59e0b}
        .mk-main{flex:1;display:flex;flex-direction:column;padding:20px;gap:10px;justify-content:flex-end}
        .bub{max-width:72%;padding:12px 16px;border-radius:14px;font-size:.82rem;line-height:1.7}
        .bub-c{background:var(--surface2);align-self:flex-start;border-bottom-right-radius:3px}
        .bub-a{background:linear-gradient(135deg,rgba(87,171,55,0.08),rgba(87,171,55,0.03));border:1px solid rgba(87,171,55,0.1);align-self:flex-end;border-bottom-left-radius:3px}
        .bub-tag{font-size:.6rem;color:var(--g1);font-weight:700;margin-bottom:5px;display:flex;align-items:center;gap:5px}
        .bub-tag::before{content:'';width:5px;height:5px;background:var(--g1);border-radius:50%;display:inline-block}

        .l-section{padding:100px 24px}
        .sec-in{max-width:1100px;margin:0 auto}
        .sec-tag{display:inline-block;padding:6px 14px;border:1px solid var(--border2);border-radius:8px;font-size:.7rem;font-weight:700;color:var(--g1);text-transform:uppercase;letter-spacing:2px;margin-bottom:20px}
        .sec-h{font-size:clamp(1.8rem,3.5vw,2.6rem);font-weight:900;margin-bottom:16px;letter-spacing:-.5px;line-height:1.25}
        .sec-p{font-size:1.05rem;color:var(--text2);line-height:1.8;max-width:550px;margin-bottom:60px}

        .prb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .prb{padding:28px;background:var(--surface);border:1px solid var(--border);border-radius:14px;transition:all .4s;position:relative;overflow:hidden}
        .prb::after{content:'';position:absolute;top:0;right:0;width:3px;height:0;background:#ef4444;transition:height .4s;border-radius:0 0 0 3px}
        .prb:hover::after{height:100%}
        .prb:hover{border-color:rgba(239,68,68,0.15);transform:translateY(-4px)}
        .prb-num{font-size:.65rem;color:var(--text3);font-weight:700;letter-spacing:2px;margin-bottom:14px}
        .prb h3{font-size:.95rem;font-weight:700;margin-bottom:8px}
        .prb p{font-size:.9rem;color:var(--text2);line-height:1.8}

        .sol-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .sol{padding:28px;background:var(--surface);border:1px solid var(--border);border-radius:14px;transition:all .4s;position:relative;overflow:hidden}
        .sol::after{content:'';position:absolute;top:0;right:0;width:3px;height:0;background:var(--g1);transition:height .4s}
        .sol:hover::after{height:100%}
        .sol:hover{border-color:rgba(87,171,55,0.12);transform:translateY(-4px);box-shadow:0 20px 40px rgba(0,0,0,.2)}
        .sol-icon{width:40px;height:40px;border-radius:10px;background:var(--accent);display:flex;align-items:center;justify-content:center;margin-bottom:16px}
        .sol-icon svg{width:20px;height:20px;stroke:var(--g1);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .sol h3{font-size:.95rem;font-weight:700;margin-bottom:8px}
        .sol p{font-size:.9rem;color:var(--text2);line-height:1.8}

        .steps{display:flex;gap:20px}
        .step{flex:1;padding:36px 28px;background:var(--surface);border:1px solid var(--border);border-radius:16px;text-align:center;transition:all .4s;position:relative}
        .step:hover{border-color:rgba(87,171,55,0.15);transform:translateY(-5px)}
        .step-n{width:48px;height:48px;border-radius:50%;background:var(--g1);color:#050509;display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:900;margin:0 auto 20px;box-shadow:0 0 30px rgba(87,171,55,0.2)}
        .step h3{font-size:1rem;font-weight:700;margin-bottom:8px}
        .step p{font-size:.9rem;color:var(--text2);line-height:1.8}
        .step-line{width:40px;height:1px;background:var(--border2);align-self:center;flex-shrink:0}

        .price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:960px;margin:0 auto}
        .price{padding:36px 28px;background:var(--surface);border:1px solid var(--border);border-radius:18px;transition:all .4s;position:relative;text-align:center}
        .price:hover{transform:translateY(-5px)}
        .price.pop{border:1.5px solid var(--g1);background:linear-gradient(180deg,rgba(87,171,55,0.04),transparent);box-shadow:0 0 60px rgba(87,171,55,0.06);transform:scale(1.04)}
        .price.pop:hover{transform:scale(1.04) translateY(-5px)}
        .pop-tag{position:absolute;top:-13px;left:50%;transform:translateX(-50%);padding:5px 18px;background:var(--g1);border-radius:100px;font-size:.72rem;font-weight:700;color:#050509;white-space:nowrap}
        .price-name{font-size:1rem;font-weight:600;color:var(--text2);margin-bottom:20px}
        .price.pop .price-name{color:var(--g1)}
        .price-amount{font-size:3.2rem;font-weight:900;margin-bottom:4px;display:flex;align-items:baseline;justify-content:center;gap:6px}
        .price-cur{font-size:1rem;font-weight:500;color:var(--text2)}
        .price-per{font-size:.8rem;color:var(--text3);margin-bottom:28px}
        .price ul{list-style:none;text-align:right;margin-bottom:28px;padding:0}
        .price li{padding:9px 0;font-size:.88rem;color:var(--text2);display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)}
        .price li:last-child{border:none}
        .chk{color:var(--g1);font-size:.7rem;font-weight:900;width:18px;height:18px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .btn-price{width:100%;padding:13px;border-radius:10px;font-family:inherit;font-size:.9rem;font-weight:700;cursor:pointer;transition:all .3s}
        .btn-price-d{background:var(--surface2);border:1px solid var(--border2);color:var(--text)}
        .btn-price-d:hover{border-color:var(--g1)}
        .btn-price-g{background:var(--g1);border:none;color:#050509;box-shadow:0 0 25px rgba(87,171,55,0.2)}
        .btn-price-g:hover{box-shadow:0 0 45px rgba(87,171,55,0.3)}
        .price-note{font-size:.72rem;color:var(--text3);margin-top:10px}

        .rev-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .rev{padding:28px;background:var(--surface);border:1px solid var(--border);border-radius:14px;transition:all .3s}
        .rev:hover{border-color:var(--border2)}
        .rev-stars{margin-bottom:16px;color:var(--g1);font-size:.7rem;letter-spacing:3px}
        .rev-txt{font-size:.92rem;line-height:1.9;color:var(--text2);margin-bottom:20px}
        .rev-who{display:flex;align-items:center;gap:12px}
        .rev-av{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;flex-shrink:0}
        .rev-name{font-size:.85rem;font-weight:700}
        .rev-role{font-size:.72rem;color:var(--text3)}

        .l-cta{text-align:center;padding:120px 24px}
        .cta-box{max-width:660px;margin:0 auto;padding:56px 48px;border:1px solid var(--border2);border-radius:24px;background:var(--surface);position:relative;overflow:hidden}
        .cta-box::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle,rgba(87,171,55,0.06),transparent 60%);pointer-events:none}
        .cta-box>*{position:relative;z-index:1}
        .cta-box h2{font-size:2rem;font-weight:900;margin-bottom:14px;letter-spacing:-.5px}
        .cta-box p{color:var(--text2);margin-bottom:32px;font-size:1rem}

        .l-footer{padding:32px 24px;border-top:1px solid var(--border)}
        .ft-in{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
        .ft-links{display:flex;gap:20px}
        .ft-links button{color:var(--text3);text-decoration:none;font-size:.78rem;transition:color .3s;background:none;border:none;cursor:pointer;font-family:inherit}
        .ft-links button:hover{color:var(--text)}
        .ft-copy{font-size:.78rem;color:var(--text3)}

        .rv{opacity:0;transform:translateY(24px);transition:all .7s cubic-bezier(.16,1,.3,1)}
        .rv.rv-on{opacity:1;transform:none}

        @media(max-width:768px){
          .l-nav{padding:14px 20px}
          .nav-lnk{display:none}
          .hero{padding:110px 20px 60px}
          .hero-btns{flex-direction:column}
          .btn-hero{width:100%;text-align:center}
          .metrics{flex-direction:column;border-radius:12px}
          .metric{padding:16px}
          .mk-sidebar{display:none}
          .prb-grid,.sol-grid,.rev-grid,.price-grid{grid-template-columns:1fr}
          .price.pop{transform:none}
          .price.pop:hover{transform:translateY(-5px)}
          .steps{flex-direction:column}
          .step-line{display:none}
          .sec-h{font-size:1.7rem}
          .ft-in{flex-direction:column;gap:16px;text-align:center}
          .cta-box{padding:40px 24px}
          .mockup-wrap{padding:0 16px 80px}
        }
      `}</style>

      <nav ref={navRef} className="l-nav" data-testid="landing-nav">
        <div className="nav-in">
          <a href="/landing" className="l-logo" data-testid="text-brand-logo" style={{ display: "flex", alignItems: "center" }}><ChatnaLogo height={56} /></a>
          <div className="nav-r">
            <button className="nav-lnk" onClick={() => scrollTo("features")} data-testid="link-features">المميزات</button>
            <button className="nav-lnk" onClick={() => scrollTo("how")} data-testid="link-how">كيف يعمل</button>
            <button className="nav-lnk" onClick={() => scrollTo("pricing")} data-testid="link-pricing">الأسعار</button>
            <button className="l-btn l-btn-o" onClick={() => navigate("/login")} data-testid="button-login">الدخول</button>
            <button className="l-btn l-btn-f" onClick={() => navigate("/login")} data-testid="button-register">ابدأ مجاناً</button>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="glow-top" />
        <div className="hero-in">
          <div className="hero-tag" data-testid="text-hero-tag"><span className="dot" />منصة خدمة عملاء واتساب بالذكاء الاصطناعي</div>
          <h1 data-testid="text-hero-title">حوّل واتساب شركتك<br />إلى <span className="hl">قوة خارقة</span></h1>
          <p data-testid="text-hero-subtitle">ذكاء اصطناعي يرد فوراً، فريقك يتعاون على رقم واحد، وتحليلات حقيقية تساعدك تنمو — كله من مكان واحد.</p>
          <div className="hero-btns">
            <button className="btn-hero btn-hero-g" onClick={() => navigate("/login")} data-testid="button-hero-start">ابدأ تجربتك المجانية</button>
            <button className="btn-hero btn-hero-o" onClick={() => scrollTo("features")} data-testid="button-hero-features">اكتشف المميزات</button>
          </div>
          <div className="metrics" data-testid="metrics-bar">
            <div className="metric"><div className="metric-n">+500</div><div className="metric-l">شركة تستخدم Chatna</div></div>
            <div className="metric"><div className="metric-n">2M+</div><div className="metric-l">رسالة تمت معالجتها</div></div>
            <div className="metric"><div className="metric-n">4.9</div><div className="metric-l">متوسط تقييم العملاء</div></div>
          </div>
        </div>
      </section>

      <div className="mockup-wrap rv" data-testid="mockup-section">
        <div className="mockup">
          <div className="mk-bar"><div className="mk-dot" /><div className="mk-dot" /><div className="mk-dot" /></div>
          <div className="mk-body">
            <div className="mk-main">
              <div className="bub bub-c">السلام عليكم، أبي أسأل عن عروض الصيف لتركيا</div>
              <div className="bub bub-a">
                <div className="bub-tag">AI — ثقة 94%</div>
                وعليكم السلام! عندنا 3 باقات لتركيا تبدأ من 3,000 ريال شاملة الفندق والجولات. تبي أرسل لك التفاصيل الكاملة؟
              </div>
              <div className="bub bub-c">إيه، وكم مدة الرحلة؟</div>
              <div className="bub bub-a">
                <div className="bub-tag">AI — ثقة 91%</div>
                الباقة الاقتصادية 5 أيام، المميزة 7 أيام، والفاخرة 10 أيام. كل الباقات تشمل التذاكر والتأمين. تبي أحجز لك ولا تفضّل تكلم موظف متخصص؟
              </div>
            </div>
            <div className="mk-sidebar">
              <div className="mk-item on">
                <div className="mk-av mk-av-g">أع</div>
                <div className="mk-info"><div className="mk-name">أحمد العتيبي</div><div className="mk-msg">أبي أسأل عن عروض الصيف</div></div>
                <div className="mk-badge mk-badge-ai">AI</div>
              </div>
              <div className="mk-item">
                <div className="mk-av mk-av-b">نس</div>
                <div className="mk-info"><div className="mk-name">نورة السعيد</div><div className="mk-msg">متى موعد رحلة المالديف؟</div></div>
              </div>
              <div className="mk-item">
                <div className="mk-av mk-av-a">خح</div>
                <div className="mk-info"><div className="mk-name">خالد الحربي</div><div className="mk-msg">شكراً الخدمة ممتازة</div></div>
                <div className="mk-badge mk-badge-vip">VIP</div>
              </div>
              <div className="mk-item">
                <div className="mk-av mk-av-p">سم</div>
                <div className="mk-info"><div className="mk-name">سارة المالكي</div><div className="mk-msg">أبي أعدّل الحجز</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="l-section rv">
        <div className="sec-in">
          <div className="sec-tag">المشكلة</div>
          <h2 className="sec-h" data-testid="text-problems-title">واتساب العادي ما يكفي لشركتك</h2>
          <p className="sec-p">هذي المشاكل اللي تواجهها كل يوم بدون نظام متكامل</p>
          <div className="prb-grid">
            <div className="prb"><div className="prb-num">01</div><h3>موظف واحد على الرقم</h3><p>الرسائل تتراكم والعميل ينتظر لأن شخص واحد بس يقدر يرد من الجوال.</p></div>
            <div className="prb"><div className="prb-num">02</div><h3>صمت كامل بعد الدوام</h3><p>60% من العملاء يراسلون مساءً. بدون نظام، تخسرهم كلهم.</p></div>
            <div className="prb"><div className="prb-num">03</div><h3>أسئلة متكررة بلا نهاية</h3><p>فريقك يقضي ساعات يرد على نفس الأسئلة: الأسعار، المواعيد، الموقع.</p></div>
            <div className="prb"><div className="prb-num">04</div><h3>لا ذاكرة عن العميل</h3><p>كل محادثة تبدأ من الصفر. ما تعرف تاريخه ولا تصنيفه ولا احتياجاته.</p></div>
            <div className="prb"><div className="prb-num">05</div><h3>لا أرقام ولا تقارير</h3><p>ما تقدر تقيس سرعة الرد ولا أداء الموظفين ولا رضا العملاء.</p></div>
            <div className="prb"><div className="prb-num">06</div><h3>تسويق يدوي بطيء</h3><p>ترسل العروض واحد واحد وما تعرف مين فتح ومين تجاهل.</p></div>
          </div>
        </div>
      </section>

      <section id="features" className="l-section rv">
        <div className="sec-in" style={{ position: "relative" }}>
          <div className="glow-side" />
          <div className="sec-tag">الحل</div>
          <h2 className="sec-h" data-testid="text-solutions-title">Chatna يعطيك كل شي تحتاجه</h2>
          <p className="sec-p">منصة واحدة تحوّل واتساب شركتك لنظام خدمة عملاء محترف</p>
          <div className="sol-grid">
            <div className="sol">
              <div className="sol-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
              <h3>فريق كامل على رقم واحد</h3>
              <p>وزّع المحادثات تلقائياً على فريقك. كل موظف يشوف محادثاته ويرد من لوحة التحكم.</p>
            </div>
            <div className="sol">
              <div className="sol-icon"><svg viewBox="0 0 24 24"><path d="M12 2a4 4 0 0 0-4 4c0 2 2 3 2 6H6a2 2 0 0 0-2 2v2h16v-2a2 2 0 0 0-2-2h-4c0-3 2-4 2-6a4 4 0 0 0-4-4Z"/><path d="M9 18h6v2a3 3 0 0 1-6 0v-2Z"/></svg></div>
              <h3>ذكاء اصطناعي يرد 24/7</h3>
              <p>مدرّب على بيانات شركتك. يرد بثقة ويحوّل للموظف لما يحتاج.</p>
            </div>
            <div className="sol">
              <div className="sol-icon"><svg viewBox="0 0 24 24"><path d="m13 2-2 2.5h3L12 7"/><path d="M10 14v-3"/><path d="M14 14v-3"/><path d="M12 14v-3"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg></div>
              <h3>أتمتة ذكية</h3>
              <p>ردود تلقائية للأسئلة المتكررة. النظام يتعلم ويتحسن مع كل محادثة.</p>
            </div>
            <div className="sol">
              <div className="sol-icon"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m22 8-5 5"/><path d="m17 8 5 5"/></svg></div>
              <h3>ملف شامل لكل عميل</h3>
              <p>تاريخ كامل، تصنيفات، ملاحظات داخلية. تعرف عميلك قبل ما يتكلم.</p>
            </div>
            <div className="sol">
              <div className="sol-icon"><svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg></div>
              <h3>تحليلات لحظية</h3>
              <p>أداء الفريق، سرعة الرد، تقييم العملاء. أرقام حقيقية تبني قراراتك.</p>
            </div>
            <div className="sol">
              <div className="sol-icon"><svg viewBox="0 0 24 24"><path d="m3 11 18-5v12L3 13v-2Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg></div>
              <h3>حملات تسويقية</h3>
              <p>صمم عروضك بالذكاء الاصطناعي وأرسلها لآلاف العملاء مع تتبع كامل.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="l-section rv" style={{ textAlign: "center" }}>
        <div className="sec-in">
          <div className="sec-tag">البداية</div>
          <h2 className="sec-h" data-testid="text-steps-title">جاهز في 10 دقائق</h2>
          <p className="sec-p" style={{ margin: "0 auto 60px" }}>ثلاث خطوات فقط وشركتك تستقبل عملاء بذكاء</p>
          <div className="steps">
            <div className="step"><div className="step-n">1</div><h3>سجّل واربط رقمك</h3><p>حساب مجاني + ربط رقم واتساب شركتك بضغطتين.</p></div>
            <div className="step-line" />
            <div className="step"><div className="step-n">2</div><h3>درّب المساعد الذكي</h3><p>أضف معلومات شركتك. الذكاء الاصطناعي يبدأ يرد فوراً.</p></div>
            <div className="step-line" />
            <div className="step"><div className="step-n">3</div><h3>استقبل العملاء</h3><p>AI يرد وفريقك يتابع. بسيطة وقوية.</p></div>
          </div>
        </div>
      </section>

      <section id="pricing" className="l-section rv" style={{ textAlign: "center" }}>
        <div className="sec-in">
          <div className="sec-tag">الأسعار</div>
          <h2 className="sec-h" data-testid="text-pricing-title">بسيطة وشفافة</h2>
          <p className="sec-p" style={{ margin: "0 auto 16px" }}>14 يوم تجربة مجانية — بدون بطاقة ائتمانية</p>
          <br /><br />
          <div className="price-grid">
            <div className="price" data-testid="card-plan-basic">
              <div className="price-name">الأساسية</div>
              <div className="price-amount"><span className="price-cur">ر.س</span>79</div>
              <div className="price-per">شهرياً</div>
              <ul>
                <li><span className="chk">✓</span>2 موظفين</li>
                <li><span className="chk">✓</span>500 رسالة ذكاء اصطناعي</li>
                <li><span className="chk">✓</span>ردود تلقائية</li>
                <li><span className="chk">✓</span>قاعدة معرفة</li>
              </ul>
              <button className="btn-price btn-price-d" onClick={() => navigate("/login")} data-testid="button-plan-basic">ابدأ مجاناً</button>
              <div className="price-note">14 يوم تجربة مجانية</div>
            </div>
            <div className="price pop" data-testid="card-plan-pro">
              <div className="pop-tag">الأكثر طلباً</div>
              <div className="price-name">الاحترافية</div>
              <div className="price-amount"><span className="price-cur">ر.س</span>149</div>
              <div className="price-per">شهرياً</div>
              <ul>
                <li><span className="chk">✓</span>5 موظفين</li>
                <li><span className="chk">✓</span>2,000 رسالة ذكاء اصطناعي</li>
                <li><span className="chk">✓</span>كل مميزات الأساسية</li>
                <li><span className="chk">✓</span>حملات تسويقية</li>
                <li><span className="chk">✓</span>تقارير متقدمة</li>
                <li><span className="chk">✓</span>كتالوج منتجات</li>
              </ul>
              <button className="btn-price btn-price-g" onClick={() => navigate("/login")} data-testid="button-plan-pro">ابدأ مجاناً</button>
              <div className="price-note">14 يوم تجربة مجانية</div>
            </div>
            <div className="price" data-testid="card-plan-enterprise">
              <div className="price-name">المؤسسات</div>
              <div className="price-amount"><span className="price-cur">ر.س</span>299</div>
              <div className="price-per">شهرياً</div>
              <ul>
                <li><span className="chk">✓</span>15 موظف</li>
                <li><span className="chk">✓</span>10,000 رسالة ذكاء اصطناعي</li>
                <li><span className="chk">✓</span>كل المميزات</li>
                <li><span className="chk">✓</span>API مخصص</li>
                <li><span className="chk">✓</span>أولوية في الدعم الفني</li>
              </ul>
              <button className="btn-price btn-price-d" onClick={() => navigate("/login")} data-testid="button-plan-enterprise">ابدأ مجاناً</button>
              <div className="price-note">14 يوم تجربة مجانية</div>
            </div>
          </div>
        </div>
      </section>

      <section className="l-section rv" style={{ textAlign: "center" }}>
        <div className="sec-in">
          <div className="sec-tag">آراء العملاء</div>
          <h2 className="sec-h" data-testid="text-reviews-title">شركات سعودية تثق بـ Chatna</h2>
          <p className="sec-p" style={{ margin: "0 auto 60px" }}>نتائج حقيقية من شركات حقيقية</p>
          <div className="rev-grid">
            <div className="rev" data-testid="card-review-1">
              <div className="rev-stars">★ ★ ★ ★ ★</div>
              <div className="rev-txt">وفّرنا 3 موظفين خدمة عملاء. الذكاء الاصطناعي يتعامل مع 80% من الاستفسارات بدون تدخل بشري. العملاء ما يفرقون.</div>
              <div className="rev-who"><div className="rev-av mk-av-g">أر</div><div><div className="rev-name">أحمد الراشد</div><div className="rev-role">مدير متجر إلكتروني</div></div></div>
            </div>
            <div className="rev" data-testid="card-review-2">
              <div className="rev-stars">★ ★ ★ ★ ★</div>
              <div className="rev-txt">قبل Chatna كنا نخسر عملاء الليل. الحين الرد فوري 24/7 والمبيعات زادت 40% من أول شهر. ما أتخيل نرجع للطريقة القديمة.</div>
              <div className="rev-who"><div className="rev-av mk-av-a">سق</div><div><div className="rev-name">سارة القحطاني</div><div className="rev-role">صاحبة مطعم</div></div></div>
            </div>
            <div className="rev" data-testid="card-review-3">
              <div className="rev-stars">★ ★ ★ ★ ★</div>
              <div className="rev-txt">الفريق كله يشتغل من داشبورد واحد والتقارير ساعدتنا نطوّر أداء الموظفين بشكل ملحوظ. أفضل استثمار هذي السنة.</div>
              <div className="rev-who"><div className="rev-av mk-av-b">خم</div><div><div className="rev-name">خالد المطيري</div><div className="rev-role">مدير وكالة سفر</div></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="l-cta rv">
        <div className="cta-box">
          <h2 data-testid="text-cta-title">جاهز تبدأ؟</h2>
          <p>14 يوم تجربة مجانية كاملة — بدون بطاقة ائتمانية — بدون التزام</p>
          <button className="btn-hero btn-hero-g" onClick={() => navigate("/login")} data-testid="button-cta-start" style={{ fontSize: "1.05rem", padding: "16px 44px" }}>ابدأ تجربتك المجانية</button>
        </div>
      </section>

      <footer className="l-footer">
        <div className="ft-in">
          <div className="ft-links">
            <button onClick={() => scrollTo("features")}>المميزات</button>
            <button onClick={() => scrollTo("pricing")}>الأسعار</button>
          </div>
          <div className="ft-copy" data-testid="text-footer">© 2026 Chatna — جميع الحقوق محفوظة</div>
        </div>
      </footer>
    </div>
  );
}
