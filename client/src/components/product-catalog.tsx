import { useState, useEffect, useCallback } from "react";
import {
  Plus, Package, Search, Loader2, Trash2, Pencil, Send,
  ExternalLink, DollarSign, Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { Product, Contact } from "@shared/schema";

export function ProductCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [sendingProduct, setSendingProduct] = useState<Product | null>(null);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    currency: "SAR",
    imageUrl: "",
    link: "",
    category: "",
  });

  const fetchProducts = useCallback(async () => {
    try {
      const url = searchQuery ? `/api/products?search=${encodeURIComponent(searchQuery)}` : "/api/products";
      const res = await authFetch(url);
      if (res.ok) setProducts(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [searchQuery]);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await authFetch("/api/contacts");
      if (res.ok) setContacts(await res.json());
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchProducts(); fetchContacts(); }, [fetchProducts, fetchContacts]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", price: "", currency: "SAR", imageUrl: "", link: "", category: "" });
    setShowDialog(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setForm({
      name: product.name,
      description: product.description || "",
      price: product.price || "",
      currency: product.currency || "SAR",
      imageUrl: product.imageUrl || "",
      link: product.link || "",
      category: product.category || "",
    });
    setShowDialog(true);
  };

  const openSend = (product: Product) => {
    setSendingProduct(product);
    setSelectedContactId("");
    setShowSendDialog(true);
  };

  const saveProduct = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        price: form.price || null,
        currency: form.currency,
        imageUrl: form.imageUrl || null,
        link: form.link || null,
        category: form.category || null,
      };

      const res = editing
        ? await authFetch(`/api/products/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await authFetch("/api/products", { method: "POST", body: JSON.stringify(payload) });

      if (res.ok) {
        toast({ title: editing ? "تم تحديث المنتج" : "تم إضافة المنتج" });
        setShowDialog(false);
        fetchProducts();
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } catch (err) { toast({ title: "خطأ في الحفظ", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const deleteProduct = async (id: string) => {
    try {
      const res = await authFetch(`/api/products/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "تم حذف المنتج" });
        fetchProducts();
      }
    } catch (err) { toast({ title: "خطأ في الحذف", variant: "destructive" }); }
  };

  const sendProductToContact = async () => {
    if (!sendingProduct || !selectedContactId) return;
    setSendingMsg(true);
    try {
      const res = await authFetch(`/api/products/${sendingProduct.id}/send`, {
        method: "POST",
        body: JSON.stringify({ contactId: selectedContactId }),
      });
      if (res.ok) {
        toast({ title: "تم إرسال المنتج عبر واتساب" });
        setShowSendDialog(false);
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } catch (err) { toast({ title: "خطأ في الإرسال", variant: "destructive" }); }
    finally { setSendingMsg(false); }
  };

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Package className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bold text-white text-lg">كتالوج المنتجات</h2>
              <p className="text-xs text-gray-500">{products.length} منتج</p>
            </div>
          </div>
          <Button data-testid="button-add-product" onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="w-4 h-4 ml-1" /> إضافة منتج
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            data-testid="input-search-products"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث عن منتج..."
            className="bg-[#1a2235] border-white/10 text-white pr-10"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <h3 className="text-gray-400 font-medium mb-1">لا توجد منتجات</h3>
              <p className="text-gray-500 text-sm mb-4">أضف منتجاتك لمشاركتها مع عملائك عبر واتساب</p>
              <Button data-testid="button-create-first-product" onClick={openCreate} variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                <Plus className="w-4 h-4 ml-1" /> إضافة منتج
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map(product => (
                <div
                  key={product.id}
                  data-testid={`card-product-${product.id}`}
                  className="rounded-xl bg-[#111827] border border-white/5 hover:border-white/10 transition-all overflow-hidden"
                >
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 bg-gradient-to-br from-emerald-500/10 to-emerald-700/10 flex items-center justify-center">
                      <Package className="w-10 h-10 text-emerald-500/30" />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-medium text-white text-sm truncate flex-1">{product.name}</h3>
                      {product.category && (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-xs mr-2 shrink-0">
                          {product.category}
                        </Badge>
                      )}
                    </div>
                    {product.description && (
                      <p className="text-xs text-gray-400 line-clamp-2 mb-2">{product.description}</p>
                    )}
                    {product.price && (
                      <div className="flex items-center gap-1 text-emerald-400 font-medium text-sm mb-2">
                        <DollarSign className="w-3 h-3" />
                        {product.price} {product.currency || "SAR"}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Button
                        data-testid={`button-send-product-${product.id}`}
                        size="sm"
                        onClick={() => openSend(product)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs flex-1"
                      >
                        <Send className="w-3 h-3 ml-1" /> إرسال
                      </Button>
                      <Button
                        data-testid={`button-edit-product-${product.id}`}
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(product)}
                        className="text-gray-500 hover:text-white"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        data-testid={`button-delete-product-${product.id}`}
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteProduct(product.id)}
                        className="text-gray-500 hover:text-red-400 hover:bg-red-400/10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-[#111827] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editing ? "تعديل المنتج" : "إضافة منتج جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-gray-300 mb-1 block text-sm">اسم المنتج *</Label>
              <Input
                data-testid="input-product-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="اسم المنتج"
                className="bg-[#1a2235] border-white/10 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300 mb-1 block text-sm">الوصف</Label>
              <Textarea
                data-testid="input-product-description"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="وصف المنتج..."
                className="bg-[#1a2235] border-white/10 text-white min-h-[80px]"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-gray-300 mb-1 block text-sm">السعر</Label>
                <Input
                  data-testid="input-product-price"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="99.99"
                  type="number"
                  step="0.01"
                  className="bg-[#1a2235] border-white/10 text-white"
                />
              </div>
              <div className="w-28">
                <Label className="text-gray-300 mb-1 block text-sm">العملة</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="bg-[#1a2235] border-white/10 text-white" data-testid="select-product-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a2235] border-white/10">
                    <SelectItem value="SAR">ر.س</SelectItem>
                    <SelectItem value="USD">$</SelectItem>
                    <SelectItem value="EUR">€</SelectItem>
                    <SelectItem value="AED">د.إ</SelectItem>
                    <SelectItem value="KWD">د.ك</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-gray-300 mb-1 block text-sm">التصنيف</Label>
              <Input
                data-testid="input-product-category"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="مثال: إلكترونيات، ملابس..."
                className="bg-[#1a2235] border-white/10 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300 mb-1 block text-sm">رابط المنتج</Label>
              <Input
                data-testid="input-product-link"
                value={form.link}
                onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
                placeholder="https://..."
                className="bg-[#1a2235] border-white/10 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300 mb-1 block text-sm">رابط الصورة</Label>
              <Input
                data-testid="input-product-image"
                value={form.imageUrl}
                onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://..."
                className="bg-[#1a2235] border-white/10 text-white"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setShowDialog(false)} className="text-gray-400">
              إلغاء
            </Button>
            <Button
              data-testid="button-save-product"
              onClick={saveProduct}
              disabled={saving || !form.name}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              {editing ? "حفظ التعديلات" : "إضافة المنتج"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent className="bg-[#111827] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">إرسال المنتج عبر واتساب</DialogTitle>
          </DialogHeader>
          {sendingProduct && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[#0d1321] border border-white/5">
                <p className="font-medium text-white text-sm">{sendingProduct.name}</p>
                {sendingProduct.price && (
                  <p className="text-emerald-400 text-xs mt-1">{sendingProduct.price} {sendingProduct.currency || "SAR"}</p>
                )}
              </div>
              <div>
                <Label className="text-gray-300 mb-1 block text-sm">اختر جهة الاتصال</Label>
                <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                  <SelectTrigger className="bg-[#1a2235] border-white/10 text-white" data-testid="select-send-contact">
                    <SelectValue placeholder="اختر جهة اتصال..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a2235] border-white/10 max-h-48">
                    {contacts.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name || c.phone} - {c.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowSendDialog(false)} className="text-gray-400">
                  إلغاء
                </Button>
                <Button
                  data-testid="button-confirm-send-product"
                  onClick={sendProductToContact}
                  disabled={sendingMsg || !selectedContactId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {sendingMsg ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Send className="w-4 h-4 ml-1" />}
                  إرسال
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
