# تقرير الهندسة العكسية الشامل: نظام الأعطال والأقسام والماكينات (Energya Cables)
**المصدر المرجعي:** `https___erp-frontend-4ah.pages.dev_.htm` (34,605 أسطر كود)  
**ملف البيانات المستخرج:** `energya_departments_machines_seed.json`  
**تاريخ الاستخراج:** 4 نوفمبر 2026

---

## 1. تفاصيل الأقسام والماكينات (Departments & Machines)

### آلية العمل المستخرجة من دالة `trialsMachineCellHtml_` (سطر 33888):
- الدالة تقرأ ماكينات القسم المختار ديناميكياً من `TRIALS_.meta.machines[dept]`.
- **منطق الأمان والـ Fallback:** إذا لم توجد ماكينات مسجلة للقسم، يتحول الحقل تلقائياً إلى حقل إدخال نصي (`input text`) حتى لا يتعطل المشغل. أما في حال وجود ماكينات، يتم إنشاء قائمة منسدلة (`select`) مع خيار فارغ في البداية، مع التحقق من إضافة أي كود ماكينة قديم محفوظ مسبقاً للقائمة حتى لا يُفقد.

### قائمة الأقسام وثوابتها في النظام:
1. **Drawing (السحب - كود DR):** درجة اللون Hue 210 | عدد الماكينات: 7 خطوط (DR01 إلى DR07).
2. **Stranding (التجديل - كود ST):** درجة اللون Hue 165 | عدد الماكينات: 16 خطاً (مجاديل ريجيد RS01-RS05، قفصية CS01-CS02، دبل تويست DTS01، بانشرات BN01-BN08).
3. **Extrusion (العزل والسترات - كود EX):** درجة اللون Hue 40 | عدد الماكينات: 11 خطاً (EX01 إلى EX11 وتشمل خطوط EXT-03 و EX011).
4. **CV / CCV (الجهد المتوسط والعالي - كود CV):** درجة اللون Hue 350 | عدد الماكينات: 5 خطوط (CCV01 إلى CCV05 حتى جهود 500kV و 750kV).
5. **Assembly (التجميع / الجماع - كود AS):** درجة اللون Hue 250 | عدد الماكينات: 5 خطوط (درام تويستر DT01-DT04 و بو كابلر BW01).
6. **Screening (الحجب والشيلد - كود SC):** درجة اللون Hue 300 | عدد الماكينات: 6 خطوط (شرائط نحاس CT01-CT03 وأسلاك CW01-CW03).
7. **Armouring (التسليح - كود AR):** درجة اللون Hue 320 | عدد الماكينات: 6 خطوط (تسليح شريط صلب ST01-ST04 وأسلاك صلب SWA01 وألمنيوم AWA01).
8. **Rewinding (إعادة اللف - كود RW):** درجة اللون Hue 200 | عدد الماكينات: خطان (RW01, RW02).

*تم حفظ بيانات كافة الأقسام والماكينات كاملة في ملف `energya_departments_machines_seed.json`.*

---

## 2. نظام تسجيل الأعطال والتوقفات (نموذج MN-01F03)

### شريط الـ In Progress العام (`GLOBAL OPEN-FORMS STRIP`):
- يقع في أعلى الشاشة الرئيسية (`#formStrip`) ويظهر الشارة **In progress**.
- يعرض كل النماذج والتقارير المفتوحة قيد الإنجاز على مستوى النظام مع نقطة حالة لونية:
  - **أصفر (Amber):** `dirty` (تم التعديل محلياً ولم يُرسل بعد).
  - **أزرق (Blue):** `saving` (جاري الإرسال للسيرفر).
  - **أخضر (Green):** `saved` (محفوظ على السيرفر).
  - **أحمر (Red):** `error / conflict` (خطأ في الحفظ أو تعارض في البيانات).

---

### المراحل الثلاث لدورة حياة البلاغ:

```
[ المرحلة 1: الإنتاج ]         [ المرحلة 2: الصيانة ]               [ المرحلة 3: الاستلام والاعتماد ]
  تسجيل البلاغ               بدء وإتمام الإصلاح                  الفحص والتأكيد
+----------------+          +-------------------+              +-------------------------+
|  Status: OPEN  |  ----->  | Status: FINISHED  |  --------->  | Status: CLOSED          | (Fixed)
+----------------+          +-------------------+              +-------------------------+
 (بدء عداد التوقف)             (حساب التوقف المبدئي)            |
                                      ^                        v
                                      |              (Re-open / رجوع للصيانة)
                                      +------------------------+ Status: IN_PROGRESS
                                                               (إعادة تشغيل عداد التوقف)
```

### جدول تفاصيل المراحل:

| المرحلة | المرحلة 1: الإبلاغ (Report) | المرحلة 2: الإصلاح (Repair / Work) | المرحلة 3: الاستلام والاعتماد (Check / Handover) |
| :--- | :--- | :--- | :--- |
| **التبويب في النظام** | `mnt_report` (Mode: `report`) | `mnt_work` (Mode: `work`) | `mnt_check` (Mode: `check`) |
| **المسؤول / الصلاحية** | مشغل / مهندس الإنتاج | فريق الصيانة (`rights.work`) | مشرف الإنتاج / الجودة (`rights.check`) |
| **شرط الانتقال** | حدوث عطل على الخط | بلاغ بحالة `open` أو معاد بحالة `in_progress` | وصول البلاغ لحالة `finished` |
| **الحقول المطلوبة** | - المصنع والقسم والماكينة: `plant`, `dept`, `machine`<br>- تاريخ ووقت العطل: `breakdown_date`, `breakdown_time`<br>- تاريخ ووقت الإبلاغ: `reported_date`, `reported_time`<br>- الوردية: `shift` (تُحسب تلقائياً)<br>- القسم: `section`<br>- حالة الماكينة: `machine_condition` (`Stopped` / `Running`)<br>- نوع العطل: `breakdown_type` (`Mechanical`, `Electrical`..)<br>- وصف العطل: `description` (نص + Voice Note)<br>- اسم المُبلّغ: `reported_by` | - مستلم البلاغ: `received_by` (الفني)<br>- تاريخ بدء الإصلاح: `date_repaired`<br>- خطوات الإصلاح وقطع الغيار: `steps` (جدول ديناميكي: `step` وصف الخطوة، `part` قطعة الغيار المستبدلة مع زر إضافة/حذف أسطر)<br>- تاريخ ووقت الانتهاء: `end_date`, `end_time`<br>- ملاحظات الصيانة: `remarks` (نص + Voice Note)<br>- مشرف الصيانة: `maint_supervisor` | - اسم القائم بالفحص: `by` (إجباري)<br>- وقت الفحص: `at` (تلقائي)<br>- القرار `outcome` (راديو إجباري):<br>  1. `fixed` (تم الإصلاح)<br>  2. `needs_followup` (يعمل ويحتاج متابعة)<br>  3. `not_fixed` (لم يتم الإصلاح)<br>- ملاحظات الفحص: `notes` (إلزامية في حالتي الرفض/المتابعة)<br>- زمن التوقف المؤكد: مراجعة وتعديل ساعات ودقائق التوقف (`dh`, `dm`) |
| **حسابات الأوقات التلقائية** | - احتساب الوردية آلياً بناء على وقت العطل.<br>- **بدء عداد التوقف الحي (Running Downtime):**<br>`Math.round((Date.now() - Date.parse(createdAt)) / 60000)`<br>ويظهر بالواجهة: *(down X h Y min so far)*. | - عند الضغط على `Finish`، يحسب النظام تلقائياً الفرق الزمني بين وقت الإبلاغ ووقت الانتهاء بالدقائق ويحفظه في `rep.downtime`. | - في حال اختيار `fixed`: يعرض النظام وقت التوقف المحسوب ويمنح المشرف حق تأكيده أو تعديله (`confirmed by production`).<br>- في حال الرفض: يُعاد فتح عداد التوقف الحي. |
| **تغير الحالات (Status)** | البلاغ يبدأ بحالة: **`open`** | - حفظ مؤقت: **`in_progress`**<br>- إنهاء العمل: **`finished`** | - إذا كان `fixed`: يتحول إلى **`closed`** نهائياً.<br>- إذا كان `needs_followup` أو `not_fixed`: يرتد إلى **`in_progress`** مع تنبيه الصيانة بملاحظات الإنتاج. |
| **سجل المراجعات** | تسجيل حدث الإنشاء | تسجيل أحداث الصيانة | إضافة كل فحص إلى مصفوفة الفحوصات `checks`: `[{ at, outcome, notes, by }]`. |

---

## 3. تصميم مقترح لقاعدة البيانات (PostgreSQL / Supabase DDL)

```sql
-- 1. جدول الماكينات
CREATE TABLE machines (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    department VARCHAR(50) NOT NULL,
    plant_code VARCHAR(20) DEFAULT 'PWR',
    sub_category VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. جدول بلاغات الأعطال
CREATE TABLE breakdown_reports (
    id VARCHAR(50) PRIMARY KEY, -- e.g. BD-2026-0001
    plant VARCHAR(50) NOT NULL,
    department VARCHAR(50) NOT NULL,
    machine_id VARCHAR(50) REFERENCES machines(id),
    breakdown_date DATE NOT NULL,
    breakdown_time TIME NOT NULL,
    reported_date DATE NOT NULL,
    reported_time TIME NOT NULL,
    shift VARCHAR(10) NOT NULL,
    section VARCHAR(100),
    machine_condition VARCHAR(20) NOT NULL, -- 'Running' or 'Stopped'
    breakdown_type VARCHAR(50) NOT NULL,    -- 'Mechanical', 'Electrical', etc.
    description TEXT,
    voice_note_url TEXT,
    reported_by VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'finished', 'closed'
    
    -- بيانات مرحلة الصيانة
    received_by VARCHAR(100),
    date_repaired DATE,
    end_date DATE,
    end_time TIME,
    maint_supervisor VARCHAR(100),
    repair_remarks TEXT,
    repair_voice_url TEXT,
    
    -- بيانات أوقات التوقف
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    downtime_minutes INTEGER,
    downtime_source VARCHAR(20) -- 'running', 'calculated', 'confirmed'
);

-- 3. جدول خطوات الإصلاح وقطع الغيار
CREATE TABLE breakdown_repair_steps (
    id BIGSERIAL PRIMARY KEY,
    report_id VARCHAR(50) REFERENCES breakdown_reports(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    action_description TEXT NOT NULL,
    spare_part TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. جدول فحوصات واعتماد الإنتاج / الجودة
CREATE TABLE breakdown_checks (
    id BIGSERIAL PRIMARY KEY,
    report_id VARCHAR(50) REFERENCES breakdown_reports(id) ON DELETE CASCADE,
    checked_by VARCHAR(100) NOT NULL,
    outcome VARCHAR(30) NOT NULL, -- 'fixed', 'needs_followup', 'not_fixed'
    notes TEXT,
    confirmed_downtime_minutes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

