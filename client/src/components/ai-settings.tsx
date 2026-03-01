import { useMemo } from "react";
import { Sparkles, Bot, MessageSquare, Building2, Globe, Phone, MapPin, Clock, Save, RotateCcw, Loader2, Brain, ExternalLink, Info, BookOpen, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const aiSettingsSchema = z.object({
  aiEnabled: z.boolean(),
  aiTone: z.enum(["friendly", "professional", "formal", "casual"]),
  languagePreference: z.enum(["auto", "ar", "en"]),
  aiPersonalityInstructions: z.string().max(2000).default(""),
  aiSystemPrompt: z.string().max(2000).default(""),
  businessDescription: z.string().default(""),
  businessType: z.string().default(""),
  contactPhone: z.string().default(""),
  website: z.string().default(""),
  workingHours: z.string().default(""),
  address: z.string().default(""),
  welcomeMessage: z.string().default(""),
  offHoursMessage: z.string().default(""),
  defaultEscalationMessage: z.string().default(""),
});

type AiSettingsForm = z.infer<typeof aiSettingsSchema>;

interface AiSettingsResponse extends AiSettingsForm {
  name: string;
  knowledgeBaseCount: number;
}

const defaultValues: AiSettingsForm = {
  aiEnabled: true,
  aiTone: "friendly",
  languagePreference: "auto",
  aiPersonalityInstructions: "",
  aiSystemPrompt: "",
  businessDescription: "",
  businessType: "",
  contactPhone: "",
  website: "",
  workingHours: "",
  address: "",
  welcomeMessage: "",
  offHoursMessage: "",
  defaultEscalationMessage: "",
};

const toneLabels: Record<string, string> = {
  friendly: "ودود",
  professional: "احترافي",
  formal: "رسمي",
  casual: "عفوي",
};

const toneDescriptions: Record<string, string> = {
  friendly: "أسلوب دافئ ومرحب يشعر العميل بالراحة",
  professional: "أسلوب مهني ومنظم يعكس الاحترافية",
  formal: "أسلوب رسمي ومؤدب للتعاملات الجادة",
  casual: "أسلوب بسيط وعفوي قريب من العميل",
};

const langLabels: Record<string, string> = {
  auto: "تلقائي (حسب لغة العميل)",
  ar: "العربية دائماً",
  en: "الإنجليزية دائماً",
};

const businessTypes = [
  { value: "retail", label: "تجارة تجزئة" },
  { value: "restaurant", label: "مطعم / كافيه" },
  { value: "healthcare", label: "رعاية صحية" },
  { value: "education", label: "تعليم" },
  { value: "technology", label: "تقنية" },
  { value: "real_estate", label: "عقارات" },
  { value: "automotive", label: "سيارات" },
  { value: "travel", label: "سياحة وسفر" },
  { value: "finance", label: "خدمات مالية" },
  { value: "government", label: "جهة حكومية" },
  { value: "other", label: "أخرى" },
];

function SampleReply({ tone, lang }: { tone: string; lang: string }) {
  const samples: Record<string, Record<string, string>> = {
    friendly: {
      ar: "أهلاً وسهلاً! كيف أقدر أساعدك اليوم؟ أنا هنا عشانك!",
      en: "Hey there! How can I help you today? I'm here for you!",
    },
    professional: {
      ar: "مرحباً بكم. كيف يمكنني مساعدتكم؟ يسعدني خدمتكم.",
      en: "Welcome. How may I assist you? I'm happy to serve you.",
    },
    formal: {
      ar: "السلام عليكم ورحمة الله. نشكركم للتواصل معنا. كيف يمكننا خدمتكم؟",
      en: "Greetings. Thank you for reaching out. How may we be of service?",
    },
    casual: {
      ar: "هلا! وش تبي تعرف؟ قولي وأنا أساعدك",
      en: "Hi! What do you want to know? Tell me and I'll help",
    },
  };
  const displayLang = lang === "auto" ? "ar" : lang;
  return (
    <div className="bg-card border border-border rounded-lg p-3 mt-3" data-testid="text-sample-reply">
      <div className="flex items-center gap-2 mb-2">
        <Bot className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">معاينة الرد</span>
      </div>
      <p className="text-xs text-foreground/80 leading-relaxed" dir={displayLang === "ar" ? "rtl" : "ltr"}>
        {samples[tone]?.[displayLang] || samples.friendly.ar}
      </p>
    </div>
  );
}

interface AiSettingsProps {
  onNavigateToKnowledgeBase: () => void;
}

export function AiSettings({ onNavigateToKnowledgeBase }: AiSettingsProps) {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<AiSettingsResponse>({
    queryKey: ["/api/settings/ai"],
  });

  const form = useForm<AiSettingsForm>({
    resolver: zodResolver(aiSettingsSchema),
    defaultValues,
    values: data ? {
      aiEnabled: data.aiEnabled,
      aiTone: data.aiTone as AiSettingsForm["aiTone"],
      languagePreference: data.languagePreference as AiSettingsForm["languagePreference"],
      aiPersonalityInstructions: data.aiPersonalityInstructions,
      aiSystemPrompt: data.aiSystemPrompt,
      businessDescription: data.businessDescription,
      businessType: data.businessType,
      contactPhone: data.contactPhone,
      website: data.website,
      workingHours: data.workingHours,
      address: data.address,
      welcomeMessage: data.welcomeMessage,
      offHoursMessage: data.offHoursMessage,
      defaultEscalationMessage: data.defaultEscalationMessage,
    } : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: AiSettingsForm) => {
      await apiRequest("PATCH", "/api/settings/ai", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ai"] });
      toast({ title: "تم حفظ إعدادات الذكاء الاصطناعي بنجاح" });
    },
    onError: () => {
      toast({ title: "فشل في حفظ الإعدادات", variant: "destructive" });
    },
  });

  const onSubmit = (values: AiSettingsForm) => {
    saveMutation.mutate(values);
  };

  const handleReset = () => {
    form.reset(defaultValues);
    toast({ title: "تم إعادة تعيين الإعدادات للقيم الافتراضية", description: "اضغط حفظ لتطبيق التغييرات" });
  };

  const watchedTone = form.watch("aiTone");
  const watchedLang = form.watch("languagePreference");
  const watchedEnabled = form.watch("aiEnabled");
  const personalityValue = form.watch("aiPersonalityInstructions");
  const systemPromptValue = form.watch("aiSystemPrompt");
  const personalityCount = personalityValue?.length || 0;
  const systemPromptCount = systemPromptValue?.length || 0;

  const allValues = form.watch();
  const hasChanges = useMemo(() => {
    if (!data) return false;
    const serverFields: (keyof AiSettingsForm)[] = [
      "aiEnabled", "aiTone", "languagePreference", "aiPersonalityInstructions",
      "aiSystemPrompt", "businessDescription", "businessType", "contactPhone",
      "website", "workingHours", "address", "welcomeMessage", "offHoursMessage",
      "defaultEscalationMessage"
    ];
    return serverFields.some((key) => allValues[key] !== (data as any)[key]);
  }, [allValues, data]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="text-loading">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/80 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-foreground" data-testid="text-ai-settings-title">إعدادات الذكاء الاصطناعي</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleReset}
            data-testid="button-reset-ai-settings"
            className="text-xs border-border text-foreground/80"
          >
            <RotateCcw className="w-3 h-3 ml-1" />
            إعادة تعيين
          </Button>
          <Button
            size="sm"
            onClick={form.handleSubmit(onSubmit)}
            disabled={saveMutation.isPending || !hasChanges}
            data-testid="button-save-ai-settings"
            className="bg-emerald-600 text-xs"
          >
            {saveMutation.isPending ? <Loader2 className="w-3 h-3 ml-1 animate-spin" /> : <Save className="w-3 h-3 ml-1" />}
            حفظ الإعدادات
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-6 max-w-4xl mx-auto pb-20">

            {/* 1. AI Identity Hero */}
            <div className="bg-gradient-to-l from-emerald-500/10 via-[#111827]/80 to-[#111827]/80 border border-emerald-500/20 rounded-xl p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Bot className="w-7 h-7 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground" data-testid="text-ai-name">{data?.name || "مساعد الذكاء الاصطناعي"}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-ai-status">
                      {watchedEnabled ? "المساعد مفعّل ويرد على العملاء تلقائياً" : "المساعد معطّل حالياً"}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" data-testid="badge-ai-enabled" className={`text-[10px] ${watchedEnabled ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"}`}>
                        {watchedEnabled ? "مفعّل" : "معطّل"}
                      </Badge>
                      <Badge variant="outline" data-testid="badge-ai-tone" className="text-[10px] border-border text-muted-foreground">
                        {toneLabels[watchedTone] || "ودود"}
                      </Badge>
                      <Badge variant="outline" data-testid="badge-ai-lang" className="text-[10px] border-border text-muted-foreground">
                        {langLabels[watchedLang] || "تلقائي"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <FormField
                  control={form.control}
                  name="aiEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 space-y-0">
                      <FormLabel className="text-sm text-foreground/80">تفعيل الذكاء الاصطناعي</FormLabel>
                      <FormControl>
                        <Switch
                          data-testid="switch-ai-enabled"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="data-[state=checked]:bg-emerald-600"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* 2. Tone & Language */}
            <div className="bg-card/60 border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-foreground">الأسلوب واللغة</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="aiTone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">أسلوب الرد</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-ai-tone" className="bg-card border-border text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-popover border-border">
                          {Object.entries(toneLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value} className="text-foreground">
                              <div>
                                <span>{label}</span>
                                <span className="text-[10px] text-muted-foreground mr-2">{toneDescriptions[value]}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="languagePreference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">لغة الرد</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-language" className="bg-card border-border text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-popover border-border">
                          {Object.entries(langLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value} className="text-foreground">
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <SampleReply tone={watchedTone} lang={watchedLang} />
            </div>

            {/* 3. Custom Instructions */}
            <div className="bg-card/60 border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-foreground">تعليمات مخصصة</h3>
              </div>
              <div className="space-y-5">
                <FormField
                  control={form.control}
                  name="aiPersonalityInstructions"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-xs text-muted-foreground">تعليمات الشخصية</FormLabel>
                        <span className={`text-[10px] ${personalityCount > 2000 ? "text-red-400" : "text-muted-foreground"}`} data-testid="text-personality-count">
                          {personalityCount} / 2000
                        </span>
                      </div>
                      <FormControl>
                        <Textarea
                          data-testid="textarea-personality"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.slice(0, 2000))}
                          placeholder="مثال: كن دائماً إيجابياً. استخدم الرموز التعبيرية باعتدال. اذكر اسم العميل في الرد. لا تستخدم كلمات تقنية معقدة."
                          rows={4}
                          className="bg-card border-border text-foreground text-sm resize-none placeholder:text-muted-foreground"
                        />
                      </FormControl>
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-[10px] text-muted-foreground">هذه التعليمات تحدد سلوك وشخصية المساعد عند التواصل مع العملاء</p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="aiSystemPrompt"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <FormLabel className="text-xs text-muted-foreground">تعليمات النظام المتقدمة</FormLabel>
                          <Code2 className="w-3 h-3 text-muted-foreground" />
                        </div>
                        <span className={`text-[10px] ${systemPromptCount > 2000 ? "text-red-400" : "text-muted-foreground"}`} data-testid="text-system-prompt-count">
                          {systemPromptCount} / 2000
                        </span>
                      </div>
                      <FormControl>
                        <Textarea
                          data-testid="textarea-system-prompt"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.slice(0, 2000))}
                          placeholder="للمستخدمين المتقدمين: أضف تعليمات نظام مخصصة هنا"
                          rows={3}
                          className="bg-card border-border text-foreground text-sm resize-none placeholder:text-muted-foreground"
                        />
                      </FormControl>
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-[10px] text-muted-foreground">للمستخدمين المتقدمين فقط. هذه التعليمات تضاف مباشرة لنظام الذكاء الاصطناعي</p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* 4. Business Context */}
            <div className="bg-card/60 border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-foreground">سياق العمل</h3>
              </div>
              <div className="space-y-5">
                <FormField
                  control={form.control}
                  name="businessDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">وصف النشاط التجاري</FormLabel>
                      <FormControl>
                        <Textarea
                          data-testid="textarea-business-description"
                          {...field}
                          placeholder="وصف مختصر لنشاطك التجاري وما تقدمه من خدمات أو منتجات"
                          rows={3}
                          className="bg-card border-border text-foreground text-sm resize-none placeholder:text-muted-foreground"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="businessType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">نوع النشاط</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-business-type" className="bg-card border-border text-foreground">
                              <SelectValue placeholder="اختر نوع النشاط" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-popover border-border">
                            {businessTypes.map((bt) => (
                              <SelectItem key={bt.value} value={bt.value} className="text-foreground">
                                {bt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <Phone className="w-3 h-3 inline ml-1" />
                          رقم التواصل
                        </FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-contact-phone"
                            {...field}
                            placeholder="+966 5x xxx xxxx"
                            dir="ltr"
                            className="bg-card border-border text-foreground text-sm placeholder:text-muted-foreground"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <Globe className="w-3 h-3 inline ml-1" />
                          الموقع الإلكتروني
                        </FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-website"
                            {...field}
                            placeholder="https://example.com"
                            dir="ltr"
                            className="bg-card border-border text-foreground text-sm placeholder:text-muted-foreground"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="workingHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <Clock className="w-3 h-3 inline ml-1" />
                          ساعات العمل
                        </FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-working-hours"
                            {...field}
                            placeholder="السبت - الخميس، 9 ص - 6 م"
                            className="bg-card border-border text-foreground text-sm placeholder:text-muted-foreground"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 inline ml-1" />
                        العنوان
                      </FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-address"
                          {...field}
                          placeholder="الرياض، المملكة العربية السعودية"
                          className="bg-card border-border text-foreground text-sm placeholder:text-muted-foreground"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* 5. Messages */}
            <div className="bg-card/60 border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-foreground">رسائل النظام</h3>
              </div>
              <div className="space-y-5">
                <FormField
                  control={form.control}
                  name="welcomeMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">رسالة الترحيب</FormLabel>
                      <FormControl>
                        <Textarea
                          data-testid="textarea-welcome-message"
                          {...field}
                          placeholder="أهلاً وسهلاً! كيف يمكنني مساعدتك اليوم؟"
                          rows={2}
                          className="bg-card border-border text-foreground text-sm resize-none placeholder:text-muted-foreground"
                        />
                      </FormControl>
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-[10px] text-muted-foreground">ترسل تلقائياً عند بدء محادثة جديدة مع العميل</p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="offHoursMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">رسالة خارج ساعات العمل</FormLabel>
                      <FormControl>
                        <Textarea
                          data-testid="textarea-off-hours"
                          {...field}
                          placeholder="شكراً لتواصلك. نحن حالياً خارج ساعات العمل. سنرد عليك في أقرب وقت ممكن."
                          rows={2}
                          className="bg-card border-border text-foreground text-sm resize-none placeholder:text-muted-foreground"
                        />
                      </FormControl>
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-[10px] text-muted-foreground">ترسل عندما يتواصل العميل خارج ساعات العمل المحددة</p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultEscalationMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">رسالة التحويل للموظف</FormLabel>
                      <FormControl>
                        <Textarea
                          data-testid="textarea-escalation"
                          {...field}
                          placeholder="سأحولك الآن لأحد موظفينا لمساعدتك بشكل أفضل. يرجى الانتظار لحظات."
                          rows={2}
                          className="bg-card border-border text-foreground text-sm resize-none placeholder:text-muted-foreground"
                        />
                      </FormControl>
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-[10px] text-muted-foreground">ترسل عندما يحوّل العميل لموظف بشري بدلاً من الذكاء الاصطناعي</p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* 6. Knowledge Base Quick Access */}
            <div className="bg-card/60 border border-border rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">قاعدة المعرفة</h3>
                    <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-knowledge-count">
                      {data?.knowledgeBaseCount !== undefined
                        ? `${data.knowledgeBaseCount} مدخل نشط يستخدمه الذكاء الاصطناعي`
                        : "جاري التحميل..."}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onNavigateToKnowledgeBase}
                  data-testid="button-go-knowledge-base"
                  className="text-xs border-emerald-500/20 text-emerald-400"
                >
                  <Brain className="w-3 h-3 ml-1" />
                  إدارة قاعدة المعرفة
                  <ExternalLink className="w-3 h-3 mr-1" />
                </Button>
              </div>
            </div>

          </form>
        </Form>
      </ScrollArea>
    </div>
  );
}
