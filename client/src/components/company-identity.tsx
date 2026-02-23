import { useMemo, useEffect, useRef, useCallback } from "react";
import { Building2, Globe, Phone, MapPin, Clock, Save, Loader2, Info, MessageSquare, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const companyIdentitySchema = z.object({
  name: z.string().min(1, "اسم الشركة مطلوب").max(255),
  businessDescription: z.string().min(1, "وصف الشركة مطلوب").max(2000),
  businessType: z.string().default(""),
  contactPhone: z.string().default(""),
  website: z.string().default(""),
  workingHours: z.string().default(""),
  address: z.string().default(""),
  aiTone: z.enum(["friendly", "professional", "formal", "casual"]).default("friendly"),
  welcomeMessage: z.string().default(""),
  offHoursMessage: z.string().default(""),
});

type CompanyIdentityForm = z.infer<typeof companyIdentitySchema>;

interface CompanyIdentityResponse extends CompanyIdentityForm {}

const defaultValues: CompanyIdentityForm = {
  name: "",
  businessDescription: "",
  businessType: "",
  contactPhone: "",
  website: "",
  workingHours: "",
  address: "",
  aiTone: "friendly",
  welcomeMessage: "",
  offHoursMessage: "",
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

export function CompanyIdentity() {
  const { toast } = useToast();
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSavedRef = useRef<string>("");

  const { data, isLoading } = useQuery<CompanyIdentityResponse>({
    queryKey: ["/api/settings/company"],
  });

  const form = useForm<CompanyIdentityForm>({
    resolver: zodResolver(companyIdentitySchema),
    defaultValues,
    values: data ? {
      name: data.name,
      businessDescription: data.businessDescription,
      businessType: data.businessType,
      contactPhone: data.contactPhone,
      website: data.website,
      workingHours: data.workingHours,
      address: data.address,
      aiTone: data.aiTone as CompanyIdentityForm["aiTone"],
      welcomeMessage: data.welcomeMessage,
      offHoursMessage: data.offHoursMessage,
    } : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: CompanyIdentityForm) => {
      await apiRequest("PATCH", "/api/settings/company", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/company"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ai"] });
    },
    onError: () => {
      toast({ title: "فشل في حفظ البيانات", variant: "destructive" });
    },
  });

  const onSubmit = (values: CompanyIdentityForm) => {
    saveMutation.mutate(values, {
      onSuccess: () => {
        toast({ title: "تم حفظ هوية الشركة بنجاح" });
      },
    });
  };

  const allValues = form.watch();
  const hasChanges = useMemo(() => {
    if (!data) return false;
    const fields: (keyof CompanyIdentityForm)[] = [
      "name", "businessDescription", "businessType", "contactPhone",
      "website", "workingHours", "address", "aiTone",
      "welcomeMessage", "offHoursMessage"
    ];
    return fields.some((key) => allValues[key] !== (data as any)[key]);
  }, [allValues, data]);

  useEffect(() => {
    if (data) {
      lastAutoSavedRef.current = JSON.stringify({
        name: data.name,
        businessDescription: data.businessDescription,
        businessType: data.businessType,
        contactPhone: data.contactPhone,
        website: data.website,
        workingHours: data.workingHours,
        address: data.address,
        aiTone: data.aiTone,
        welcomeMessage: data.welcomeMessage,
        offHoursMessage: data.offHoursMessage,
      });
    }
  }, [data]);

  const autoSave = useCallback(async () => {
    const values = form.getValues();
    if (!values.name?.trim() || !values.businessDescription?.trim()) return;

    const isValid = await form.trigger();
    if (!isValid) return;

    const snapshot = JSON.stringify(values);
    if (snapshot === lastAutoSavedRef.current) return;

    lastAutoSavedRef.current = snapshot;
    saveMutation.mutate(values);
  }, [form, saveMutation]);

  useEffect(() => {
    if (!data || !hasChanges) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      autoSave();
    }, 3000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [allValues, data, hasChanges, autoSave]);

  const watchedTone = form.watch("aiTone");

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="text-loading">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0d1321]/50 shrink-0">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-white" data-testid="text-company-identity-title">هوية الشركة</h2>
        </div>
        <div className="flex items-center gap-3">
          {saveMutation.isSuccess && !hasChanges && (
            <div className="flex items-center gap-1.5 text-emerald-400" data-testid="text-auto-save-status">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="text-[11px]">تم الحفظ</span>
            </div>
          )}
          <Button
            size="sm"
            onClick={form.handleSubmit(onSubmit)}
            disabled={saveMutation.isPending || !hasChanges}
            data-testid="button-save-company"
            className="bg-emerald-600 text-xs"
          >
            {saveMutation.isPending ? <Loader2 className="w-3 h-3 ml-1 animate-spin" /> : <Save className="w-3 h-3 ml-1" />}
            حفظ التغييرات
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-6 max-w-4xl mx-auto pb-20">

            {/* Hero Section */}
            <div className="bg-gradient-to-l from-emerald-500/10 via-[#111827]/80 to-[#111827]/80 border border-emerald-500/20 rounded-xl p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Building2 className="w-7 h-7 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white" data-testid="text-company-name-display">
                    {allValues.name || "اسم شركتك"}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">عرّف شركتك حتى يتعرّف عليها المساعد الذكي ويمثّلها بشكل صحيح</p>
                  <div className="flex items-center gap-2 mt-2">
                    {allValues.businessType && (
                      <Badge variant="outline" data-testid="badge-business-type" className="text-[10px] border-white/10 text-gray-400">
                        {businessTypes.find(bt => bt.value === allValues.businessType)?.label || allValues.businessType}
                      </Badge>
                    )}
                    <Badge variant="outline" data-testid="badge-tone" className="text-[10px] border-emerald-500/30 text-emerald-400">
                      {toneLabels[watchedTone] || "ودود"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-300">
                        اسم الشركة <span className="text-red-400">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-company-name"
                          {...field}
                          placeholder="مثال: شركة التقنية الذكية"
                          className="bg-[#0d1321] border-white/10 text-white text-sm placeholder:text-gray-600"
                        />
                      </FormControl>
                      <FormMessage className="text-red-400 text-[11px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="businessType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-300">مجال العمل</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-business-type" className="bg-[#0d1321] border-white/10 text-white">
                            <SelectValue placeholder="اختر مجال العمل" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-[#1a2235] border-white/10">
                          {businessTypes.map((bt) => (
                            <SelectItem key={bt.value} value={bt.value} className="text-white">
                              {bt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Description Section */}
            <div className="bg-[#111827]/50 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Info className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">الوصف والتعريف</h3>
              </div>
              <FormField
                control={form.control}
                name="businessDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-gray-400">
                      وصف مختصر <span className="text-red-400">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        data-testid="textarea-description"
                        {...field}
                        placeholder="وصف مختصر عن نشاطك التجاري وما تقدمه من خدمات أو منتجات. هذا الوصف يساعد المساعد الذكي على فهم طبيعة عملك والرد بشكل أفضل."
                        rows={4}
                        className="bg-[#0d1321] border-white/10 text-white text-sm resize-none placeholder:text-gray-600"
                      />
                    </FormControl>
                    <FormMessage className="text-red-400 text-[11px]" />
                  </FormItem>
                )}
              />
            </div>

            {/* Contact Info Section */}
            <div className="bg-[#111827]/50 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Phone className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">معلومات التواصل</h3>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-400">
                          <Phone className="w-3 h-3 inline ml-1" />
                          رقم التواصل
                        </FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-phone"
                            {...field}
                            placeholder="+966 5x xxx xxxx"
                            dir="ltr"
                            className="bg-[#0d1321] border-white/10 text-white text-sm placeholder:text-gray-600"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-400">
                          <Globe className="w-3 h-3 inline ml-1" />
                          الموقع الإلكتروني
                        </FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-website"
                            {...field}
                            placeholder="https://example.com"
                            dir="ltr"
                            className="bg-[#0d1321] border-white/10 text-white text-sm placeholder:text-gray-600"
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
                    name="workingHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-400">
                          <Clock className="w-3 h-3 inline ml-1" />
                          ساعات العمل
                        </FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-working-hours"
                            {...field}
                            placeholder="السبت - الخميس، 9 ص - 6 م"
                            className="bg-[#0d1321] border-white/10 text-white text-sm placeholder:text-gray-600"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-gray-400">
                          <MapPin className="w-3 h-3 inline ml-1" />
                          العنوان
                        </FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-address"
                            {...field}
                            placeholder="الرياض، المملكة العربية السعودية"
                            className="bg-[#0d1321] border-white/10 text-white text-sm placeholder:text-gray-600"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* AI Tone */}
            <div className="bg-[#111827]/50 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">نبرة الذكاء الاصطناعي</h3>
              </div>
              <FormField
                control={form.control}
                name="aiTone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-gray-400">أسلوب الرد على العملاء</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-ai-tone" className="bg-[#0d1321] border-white/10 text-white max-w-md">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-[#1a2235] border-white/10">
                        {Object.entries(toneLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value} className="text-white">
                            <div className="flex items-center gap-2">
                              <span>{label}</span>
                              <span className="text-[10px] text-gray-500">{toneDescriptions[value]}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* System Messages */}
            <div className="bg-[#111827]/50 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">الرسائل التلقائية</h3>
              </div>
              <div className="space-y-5">
                <FormField
                  control={form.control}
                  name="welcomeMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-gray-400">رسالة الترحيب</FormLabel>
                      <FormControl>
                        <Textarea
                          data-testid="textarea-welcome"
                          {...field}
                          placeholder="أهلاً وسهلاً! كيف يمكنني مساعدتك اليوم؟"
                          rows={2}
                          className="bg-[#0d1321] border-white/10 text-white text-sm resize-none placeholder:text-gray-600"
                        />
                      </FormControl>
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <Info className="w-3 h-3 text-gray-600 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-gray-600">ترسل تلقائياً عند بدء محادثة جديدة مع العميل</p>
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
                      <FormLabel className="text-xs text-gray-400">رسالة خارج ساعات العمل</FormLabel>
                      <FormControl>
                        <Textarea
                          data-testid="textarea-off-hours"
                          {...field}
                          placeholder="شكراً لتواصلك. نحن حالياً خارج ساعات العمل. سنرد عليك في أقرب وقت ممكن."
                          rows={2}
                          className="bg-[#0d1321] border-white/10 text-white text-sm resize-none placeholder:text-gray-600"
                        />
                      </FormControl>
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <Info className="w-3 h-3 text-gray-600 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-gray-600">ترسل عندما يتواصل العميل خارج ساعات العمل المحددة</p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Auto-save Indicator */}
            <div className="flex items-center justify-center gap-2 text-[11px] text-gray-500 py-2">
              <Info className="w-3 h-3" />
              <span data-testid="text-autosave-hint">يتم الحفظ تلقائياً بعد 3 ثوانٍ من آخر تعديل</span>
            </div>

          </form>
        </Form>
      </ScrollArea>
    </div>
  );
}
