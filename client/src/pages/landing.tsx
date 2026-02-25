import { useLocation } from "wouter";

export default function LandingPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <nav className="bg-white shadow-md py-4">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div className="text-2xl font-bold text-blue-600" data-testid="text-brand-logo">جواب</div>
          <div className="hidden md:flex gap-8">
            <a href="#features" className="text-gray-700 hover:text-blue-600 transition-colors" data-testid="link-features">المميزات</a>
            <a href="#pricing" className="text-gray-700 hover:text-blue-600 transition-colors" data-testid="link-pricing">الأسعار</a>
            <a href="#contact" className="text-gray-700 hover:text-blue-600 transition-colors" data-testid="link-contact">تواصل معنا</a>
          </div>
          <div className="flex gap-2">
            <button
              data-testid="button-login"
              onClick={() => navigate("/login")}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              تسجيل الدخول
            </button>
            <button
              data-testid="button-register"
              onClick={() => navigate("/login")}
              className="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium"
            >
              إنشاء حساب
            </button>
          </div>
        </div>
      </nav>

      <section className="bg-gradient-to-b from-blue-50 to-white py-20">
        <div className="container mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-4" data-testid="text-hero-title">
            منصة خدمة العملاء الذكية عبر واتساب
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto" data-testid="text-hero-subtitle">
            اجمع كل محادثات واتساب في مكان واحد، ورد بذكاء مع فريقك، وحسن تجربة عملائك.
          </p>
          <div className="bg-green-100 text-green-800 py-3 px-6 rounded-full inline-block mb-8 text-sm font-medium">
            🎯 جرّب مجاناً 14 يوم - بدون بطاقة ائتمانية
          </div>
          <div className="flex justify-center gap-4">
            <button
              data-testid="button-hero-start"
              onClick={() => navigate("/login")}
              className="bg-green-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-green-700 transition-colors"
            >
              ابدأ مجاناً
            </button>
            <a
              href="#features"
              data-testid="link-hero-features"
              className="border border-blue-600 text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition-colors"
            >
              عرض المميزات
            </a>
          </div>
        </div>
      </section>

      <section className="py-16 bg-white" id="features">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-gray-800 mb-12" data-testid="text-features-title">
            كل ما تحتاجه لإدارة واتساب باحترافية
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6 border rounded-2xl shadow-sm hover:shadow-md transition-shadow" data-testid="card-feature-ai">
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="text-xl font-semibold mb-2 text-gray-800">ردود ذكية بالذكاء الاصطناعي</h3>
              <p className="text-gray-600">وفر وقت فريقك مع ردود آلية دقيقة من Claude AI.</p>
            </div>
            <div className="text-center p-6 border rounded-2xl shadow-sm hover:shadow-md transition-shadow" data-testid="card-feature-team">
              <div className="text-4xl mb-4">👥</div>
              <h3 className="text-xl font-semibold mb-2 text-gray-800">فريق متكامل</h3>
              <p className="text-gray-600">أضف موظفين بصلاحيات مختلفة وتعاون معهم بسهولة.</p>
            </div>
            <div className="text-center p-6 border rounded-2xl shadow-sm hover:shadow-md transition-shadow" data-testid="card-feature-analytics">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2 text-gray-800">تقارير وتحليلات</h3>
              <p className="text-gray-600">تابع أداء فريقك ورضا العملاء عبر إحصائيات مفصلة.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50" id="pricing">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <span className="bg-green-100 text-green-800 py-2 px-4 rounded-full text-lg font-medium inline-block mb-4">
              🎯 جرّب مجاناً 14 يوم - بدون بطاقة ائتمانية
            </span>
            <h2 className="text-3xl font-bold text-gray-800" data-testid="text-pricing-title">خطط أسعار تناسب جميع الأعمال</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto items-start">
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200 hover:shadow-xl transition-shadow" data-testid="card-plan-basic">
              <div className="p-8">
                <h3 className="text-2xl font-bold text-gray-800 mb-2">الأساسية</h3>
                <div className="text-4xl font-bold text-blue-600 mb-4">
                  79 <span className="text-lg font-normal text-gray-500">ر.س/شهرياً</span>
                </div>
                <ul className="space-y-3 mb-8 text-gray-700">
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> 2 موظفين</li>
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> 500 رسالة ذكاء اصطناعي (شهرياً)</li>
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> ردود تلقائية</li>
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> قاعدة معرفة</li>
                </ul>
                <button
                  data-testid="button-plan-basic"
                  onClick={() => navigate("/login")}
                  className="w-full bg-gray-800 text-white py-3 rounded-lg font-semibold hover:bg-gray-900 transition-colors"
                >
                  ابدأ مجاناً
                </button>
                <p className="text-xs text-gray-500 text-center mt-2">14 يوم تجربة</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl overflow-hidden relative md:scale-105 z-10 border-2 border-green-500" style={{ boxShadow: "0 0 20px rgba(34, 197, 94, 0.5)" }} data-testid="card-plan-pro">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-yellow-400 to-yellow-500 text-white text-sm font-bold py-1 px-4 rounded-full shadow-lg whitespace-nowrap">
                🔥 الأكثر طلباً
              </div>
              <div className="p-8 pt-10">
                <h3 className="text-2xl font-bold text-gray-800 mb-2">الاحترافية</h3>
                <div className="text-4xl font-bold text-blue-600 mb-4">
                  149 <span className="text-lg font-normal text-gray-500">ر.س/شهرياً</span>
                </div>
                <ul className="space-y-3 mb-8 text-gray-700">
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> 5 موظفين</li>
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> 2,000 رسالة ذكاء اصطناعي (شهرياً)</li>
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> كل مميزات الأساسية</li>
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> حملات تسويقية</li>
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> تقارير متقدمة</li>
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> كتالوج منتجات</li>
                </ul>
                <button
                  data-testid="button-plan-pro"
                  onClick={() => navigate("/login")}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors shadow-lg"
                >
                  ابدأ مجاناً
                </button>
                <p className="text-xs text-gray-500 text-center mt-2">14 يوم تجربة</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200 hover:shadow-xl transition-shadow" data-testid="card-plan-enterprise">
              <div className="p-8">
                <h3 className="text-2xl font-bold text-gray-800 mb-2">المؤسسات</h3>
                <div className="text-4xl font-bold text-blue-600 mb-4">
                  299 <span className="text-lg font-normal text-gray-500">ر.س/شهرياً</span>
                </div>
                <ul className="space-y-3 mb-8 text-gray-700">
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> 15 موظف</li>
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> 10,000 رسالة ذكاء اصطناعي (شهرياً)</li>
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> كل المميزات</li>
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> API مخصص</li>
                  <li className="flex items-center"><span className="text-green-500 ml-2">✓</span> أولوية في الدعم الفني</li>
                </ul>
                <button
                  data-testid="button-plan-enterprise"
                  onClick={() => navigate("/login")}
                  className="w-full bg-gray-800 text-white py-3 rounded-lg font-semibold hover:bg-gray-900 transition-colors"
                >
                  ابدأ مجاناً
                </button>
                <p className="text-xs text-gray-500 text-center mt-2">14 يوم تجربة</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-white border-t py-8" id="contact">
        <div className="container mx-auto px-6 text-center text-gray-600">
          <p data-testid="text-footer">© 2026 جواب - جميع الحقوق محفوظة</p>
        </div>
      </footer>
    </div>
  );
}
