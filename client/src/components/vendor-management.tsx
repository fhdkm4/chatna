import { useState, useEffect, useCallback } from "react";
import { Store, Plus, Pencil, Loader2, RefreshCw, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { authFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface Vendor {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  contactInfo: { email?: string; phone?: string; address?: string } | null;
  isActive: boolean;
  createdAt: string;
}

interface VendorTransaction {
  id: string;
  vendorId: string;
  orderId: string | null;
  tenantId: string;
  amount: string;
  currency: string;
  status: string;
  reference: string | null;
  createdAt: string;
}

const vendorTypes = [
  { value: "amadeus", label: "Amadeus" },
  { value: "tbo", label: "TBO" },
  { value: "external", label: "مورد خارجي" },
  { value: "other", label: "أخرى" },
];

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  completed: "bg-green-500/10 text-green-600 dark:text-green-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export function VendorManagement() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Record<string, VendorTransaction[]>>({});
  const [txLoading, setTxLoading] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("other");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formActive, setFormActive] = useState(true);

  const { toast } = useToast();

  const fetchVendors = useCallback(async () => {
    try {
      const res = await authFetch("/api/vendors");
      if (res.ok) setVendors(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const resetForm = () => {
    setFormName("");
    setFormType("other");
    setFormEmail("");
    setFormPhone("");
    setFormAddress("");
    setFormActive(true);
    setEditingVendor(null);
    setShowForm(false);
  };

  const openEditForm = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormName(vendor.name);
    setFormType(vendor.type || "other");
    setFormEmail(vendor.contactInfo?.email || "");
    setFormPhone(vendor.contactInfo?.phone || "");
    setFormAddress(vendor.contactInfo?.address || "");
    setFormActive(vendor.isActive);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) {
      toast({ title: "يرجى إدخال اسم المورد", variant: "destructive" });
      return;
    }
    setFormLoading(true);
    const body = {
      name: formName.trim(),
      type: formType,
      contactInfo: { email: formEmail, phone: formPhone, address: formAddress },
      isActive: formActive,
    };

    try {
      if (editingVendor) {
        const res = await authFetch(`/api/vendors/${editingVendor.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        if (res.ok) {
          toast({ title: "تم تحديث المورد بنجاح" });
          resetForm();
          fetchVendors();
        } else {
          toast({ title: "خطأ في تحديث المورد", variant: "destructive" });
        }
      } else {
        const res = await authFetch("/api/vendors", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (res.ok) {
          toast({ title: "تم إضافة المورد بنجاح" });
          resetForm();
          fetchVendors();
        } else {
          toast({ title: "خطأ في إضافة المورد", variant: "destructive" });
        }
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setFormLoading(false);
    }
  };

  const fetchTransactions = async (vendorId: string) => {
    if (expandedVendor === vendorId) {
      setExpandedVendor(null);
      return;
    }
    setExpandedVendor(vendorId);
    if (transactions[vendorId]) return;
    setTxLoading(vendorId);
    try {
      const res = await authFetch(`/api/vendors/${vendorId}/transactions`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(prev => ({ ...prev, [vendorId]: data }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTxLoading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
  };

  const getTypeLabel = (type: string) => {
    return vendorTypes.find(t => t.value === type)?.label || type;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground" data-testid="text-vendors-title">إدارة الموردين</h2>
          <p className="text-sm text-muted-foreground mt-1">إضافة وتعديل الموردين ومتابعة المعاملات</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={fetchVendors} data-testid="button-refresh-vendors">
            <RefreshCw className="w-4 h-4 ml-2" />
            تحديث
          </Button>
          <Button onClick={() => { resetForm(); setShowForm(true); }} data-testid="button-add-vendor">
            <Plus className="w-4 h-4 ml-2" />
            إضافة مورد
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <h3 className="text-base font-semibold text-foreground" data-testid="text-form-title">
              {editingVendor ? "تعديل المورد" : "إضافة مورد جديد"}
            </h3>
            <Button size="icon" variant="ghost" onClick={resetForm} data-testid="button-close-form">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendor-name">اسم المورد</Label>
              <Input
                id="vendor-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="اسم المورد"
                data-testid="input-vendor-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-type">النوع</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger data-testid="select-vendor-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vendorTypes.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-email">البريد الإلكتروني</Label>
              <Input
                id="vendor-email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="email@example.com"
                data-testid="input-vendor-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-phone">رقم الهاتف</Label>
              <Input
                id="vendor-phone"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="+966..."
                data-testid="input-vendor-phone"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="vendor-address">العنوان</Label>
              <Input
                id="vendor-address"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                placeholder="العنوان"
                data-testid="input-vendor-address"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={formActive}
                onCheckedChange={setFormActive}
                data-testid="switch-vendor-active"
              />
              <Label>نشط</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 flex-wrap">
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel-form">
              إلغاء
            </Button>
            <Button onClick={handleSubmit} disabled={formLoading} data-testid="button-submit-vendor">
              {formLoading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              {editingVendor ? "حفظ التعديلات" : "إضافة"}
            </Button>
          </div>
        </Card>
      )}

      {vendors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Store className="w-12 h-12 mb-4 opacity-40" />
          <p className="text-lg font-medium" data-testid="text-no-vendors">لا يوجد موردين</p>
          <p className="text-sm mt-1">ابدأ بإضافة مورد جديد</p>
        </div>
      ) : (
        <div className="space-y-3">
          {vendors.map((vendor) => (
            <Card key={vendor.id} className="overflow-visible" data-testid={`card-vendor-${vendor.id}`}>
              <div className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Store className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground" data-testid={`text-vendor-name-${vendor.id}`}>
                          {vendor.name}
                        </span>
                        <Badge variant={vendor.isActive ? "default" : "secondary"} data-testid={`badge-vendor-status-${vendor.id}`}>
                          {vendor.isActive ? "نشط" : "غير نشط"}
                        </Badge>
                        <Badge variant="outline" data-testid={`badge-vendor-type-${vendor.id}`}>
                          {getTypeLabel(vendor.type)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                        {vendor.contactInfo?.email && (
                          <span data-testid={`text-vendor-email-${vendor.id}`}>{vendor.contactInfo.email}</span>
                        )}
                        {vendor.contactInfo?.phone && (
                          <span data-testid={`text-vendor-phone-${vendor.id}`}>{vendor.contactInfo.phone}</span>
                        )}
                        <span>{formatDate(vendor.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEditForm(vendor)}
                      data-testid={`button-edit-vendor-${vendor.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => fetchTransactions(vendor.id)}
                      data-testid={`button-toggle-transactions-${vendor.id}`}
                    >
                      {expandedVendor === vendor.id ? (
                        <ChevronUp className="w-4 h-4 ml-2" />
                      ) : (
                        <ChevronDown className="w-4 h-4 ml-2" />
                      )}
                      المعاملات
                    </Button>
                  </div>
                </div>
              </div>

              {expandedVendor === vendor.id && (
                <div className="border-t border-border p-4">
                  {txLoading === vendor.id ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    </div>
                  ) : (transactions[vendor.id] || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4" data-testid={`text-no-transactions-${vendor.id}`}>
                      لا توجد معاملات
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-muted-foreground border-b border-border">
                            <th className="text-right py-2 px-3 font-medium">المرجع</th>
                            <th className="text-right py-2 px-3 font-medium">المبلغ</th>
                            <th className="text-right py-2 px-3 font-medium">الحالة</th>
                            <th className="text-right py-2 px-3 font-medium">التاريخ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(transactions[vendor.id] || []).map((tx) => (
                            <tr key={tx.id} className="border-b border-border last:border-0" data-testid={`row-transaction-${tx.id}`}>
                              <td className="py-2 px-3 text-foreground">{tx.reference || "-"}</td>
                              <td className="py-2 px-3 text-foreground">
                                {parseFloat(tx.amount).toLocaleString("ar-SA")} {tx.currency || "SAR"}
                              </td>
                              <td className="py-2 px-3">
                                <Badge variant="outline" className={statusColors[tx.status] || ""} data-testid={`badge-tx-status-${tx.id}`}>
                                  {tx.status === "pending" ? "معلق" : tx.status === "completed" ? "مكتمل" : tx.status === "failed" ? "فشل" : tx.status}
                                </Badge>
                              </td>
                              <td className="py-2 px-3 text-muted-foreground">{formatDate(tx.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
