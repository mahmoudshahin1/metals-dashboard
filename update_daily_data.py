# -*- coding: utf-8 -*-
"""
update_daily_data.py
====================
سكريبت التحديث التلقائي لبيانات قسم المعادن (Metals Department Dashboard)
يقوم بقراءة أي ملف تصدير جديد (Cable_Production_Records_*.csv أو Orders_Export_*.csv أو .xlsx)
واستخراج ماكينات قسم المعادن (10 ماكينات: RS01-RS06, CS01, CS02, DS01, CN)
ودمجها مع قاعدة البيانات metals_data.json وتحديث نسخة الكاش في index.html
مع إمكانية الرفع المباشر إلى GitHub.
"""

import os
import sys
import glob
import json
import re
import datetime
import subprocess

if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# خريطة الماكينات العشر لقسم المعادن
MACHINE_ID_MAP = {
    '9': 'RS01',
    '10': 'RS02',
    '11': 'RS03',
    '12': 'RS04',
    '13': 'RS05',
    '14': 'RS06',
    '15': 'CS01',
    '16': 'CS02',
    '17': 'DS01',
    '18': 'CN'
}

CORE_MACHINES = set(MACHINE_ID_MAP.values())
ALLOWED_MACHINE_IDS = set(MACHINE_ID_MAP.keys())

# العملاء المعروفين بحسب بادئة أمر الشغل
PREFIX_CUSTOMERS = {
    '1279/25': 'Energya Stock',
    '1385/26': 'السويدي اليكتريك',
    '1713/26': 'VLG RO S.R.L.',
    '177/26': 'Faber Kabel',
    '1778/26': 'Faber Kabel',
    '1789/26': 'Mehta Electricals - Kenya',
    '1868/26': 'السويدي كابلز',
    '1872/26': 'السويدي كابلز',
    '809/26': 'السويدي كابلز',
    '1101/26': 'Energya Cables',
    '1264/26': 'Eland Cables',
    '1446/26': 'Energya Cables',
    '1547/26': 'Energya Cables',
    '1553/26': 'Energya Cables',
    '1594/26': 'Energya Cables',
    '1745/26': 'Energya Cables',
    '1772/26': 'Energya Cables',
    '1948/26': 'Al Marasem',
    '1348/26': 'Hitachi Energy',
    '1546/26': 'Faber Kabel',
    '1860/26': 'Faber Kabel',
    '1463/26': 'Cleveland Cables Company',
    '1714/26': 'INSELL',
    '1835/26': 'INSELL',
    '1938/26': 'Sadacavi',
    '1560/26': 'Eland Cables',
    '1560/25': 'Energya Cables',
    '1766/26': 'Energya Cables',
    '1990/26': 'Energya Cables',
    '1993/26': 'Energya Cables',
    '2167/26': 'Energya Cables',
    '2024/26': 'Energya Cables',
    '1857/26': 'Energya Cables',
    '1830/26': 'Energya Cables',
    '1884/26': 'Energya Cables',
    '1954/26': 'Energya Cables',
    '1628/26': 'Energya Cables'
}

def clean_single_size(s):
    s = str(s or '').strip()
    if not s or s in ('-', 'nan', 'None'):
        return '-'
    s = s.replace('MM2', '').replace('mm2', '').replace('Mm2', '').replace('²', '').strip()
    if '/' in s:
        s = s.split('/')[0].strip()
    s = s.replace('*', 'x').replace('X', 'x').replace('×', 'x')
    parts = [p.strip() for p in s.split('x') if p.strip()]
    if not parts:
        return s
    std_sizes = {
        '0.5', '0.75', '1', '1.5', '2.5', '4', '6', '10', '16', '25', '35',
        '50', '70', '75', '78', '95', '120', '150', '185', '240', '300',
        '400', '500', '630', '800', '1000', '1200', '1400', '1600', '1800', '2000', '2500'
    }
    last = parts[-1]
    if last in std_sizes:
        return last
    try:
        float(last)
        return last
    except ValueError:
        pass
    for p in reversed(parts):
        if p in std_sizes:
            return p
    return last

def clean_wire_size(raw_size):
    """تنظيف وتوحيد مقاس السلك/الموصل مع الحفاظ على المقاسات المركبة مثل 240+120 و 1400"""
    s = str(raw_size or '').strip()
    if not s or s in ('-', 'nan', 'None'):
        return '-'
    s = s.replace('MM2', '').replace('mm2', '').replace('Mm2', '').replace('²', '').strip()
    if '+' in s:
        sub_parts = [clean_single_size(p) for p in s.split('+') if p.strip()]
        if sub_parts:
            return '+'.join(sub_parts)
    return clean_single_size(s)

def load_metadata_maps():
    """تحميل جداول البيانات الوصفية من wip002_pr.xls و wip001_pp.xls إذا كانت متوفرة"""
    wip2_map = {}
    if os.path.exists('wip002_pr.xls'):
        try:
            import pandas as pd
            df2 = pd.read_excel('wip002_pr.xls')
            for _, r in df2.iterrows():
                wo = str(r.get('workorder', '')).strip()
                if wo and wo not in wip2_map:
                    wip2_map[wo] = {
                        'cable': str(r.get('cable', '')).strip(),
                        'familyid': str(r.get('familyid', '')).strip().upper(),
                        'customer': str(r.get('customer', '')).strip(),
                        'joborder': str(r.get('joborder', '')).strip()
                    }
        except Exception as e:
            print(f"[تحذير] تعذر قراءة wip002_pr.xls: {e}")

    wip1_map = {}
    if os.path.exists('wip001_pp.xls'):
        try:
            import pandas as pd
            df1 = pd.read_excel('wip001_pp.xls')
            for _, r in df1.iterrows():
                wo = str(r.get('wo', '')).strip()
                if wo and wo not in wip1_map:
                    cust = str(r.get('short_name', '')).strip()
                    if cust.lower() == 'nan':
                        cust = ''
                    wip1_map[wo] = {
                        'cable': str(r.get('ecblnm', '')).strip(),
                        'volt': str(r.get('volt', '')).strip(),
                        'customer': cust,
                        'joborder': str(r.get('job_no', '')).strip()
                    }
        except Exception as e:
            print(f"[تحذير] تعذر قراءة wip001_pp.xls: {e}")

    return wip2_map, wip1_map

def find_target_file(custom_arg=None):
    """تحديد ملف التصدير المستهدف"""
    if custom_arg and os.path.exists(custom_arg):
        return custom_arg

    patterns = [
        'Cable_Production_Records_*.csv',
        'Orders_Export_*.csv',
        'Orders_Export_*.xlsx',
        '*Cable*.csv',
        '*Orders*.csv',
        '*Orders*.xlsx',
        '*.csv'
    ]
    candidates = []
    for pat in patterns:
        for f in glob.glob(pat):
            if f.endswith('.py') or f.endswith('.json') or f in ('std.csv', 'metal.csv', 'Samy.csv'):
                continue
            if os.path.isfile(f):
                candidates.append((os.path.getmtime(f), f))

    if not candidates:
        downloads_dir = os.path.join(os.path.expanduser('~'), 'Downloads')
        if os.path.exists(downloads_dir):
            for pat in patterns:
                for f in glob.glob(os.path.join(downloads_dir, pat)):
                    if f.endswith('.py') or f.endswith('.json'):
                        continue
                    if os.path.isfile(f):
                        candidates.append((os.path.getmtime(f), f))

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]

def read_export_rows(filepath):
    """قراءة صفوف ملف التصدير سواء كان CSV أو Excel"""
    import pandas as pd
    print(f"📖 جاري قراءة الملف: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()
    df = None

    if ext == '.csv':
        encodings = ['utf-8', 'utf-8-sig', 'cp1256', 'latin1']
        for enc in encodings:
            try:
                df = pd.read_csv(filepath, dtype=str, keep_default_na=False, encoding=enc)
                break
            except Exception:
                continue
    elif ext in ('.xlsx', '.xls'):
        df = pd.read_excel(filepath, dtype=str)
        df.fillna('', inplace=True)
    else:
        raise ValueError(f"صيغة الملف غير مدعومة: {ext}")

    if df is None:
        raise ValueError("تعذر قراءة الملف بأي ترميز مدعوم.")

    df.columns = [str(c).strip() for c in df.columns]
    print(f"✅ تم تحميل {len(df)} صف من الملف بنجاح.")
    return df

def find_col(columns, candidates):
    norm_cols = {re.sub(r'[^a-z0-9]', '', c.lower()): c for c in columns}
    for cand in candidates:
        norm_cand = re.sub(r'[^a-z0-9]', '', cand.lower())
        if norm_cand in norm_cols:
            return norm_cols[norm_cand]
    for cand in candidates:
        norm_cand = re.sub(r'[^a-z0-9]', '', cand.lower())
        for nc, orig in norm_cols.items():
            if norm_cand in nc or nc in norm_cand:
                return orig
    return candidates[0]

def parse_and_extract_metals(df, wip2_map, wip1_map):
    """تصفية واستخراج ماكينات قسم المعادن وتوحيد البيانات"""
    records = []

    col_order = find_col(df.columns, ['Order No', 'OrderID', 'order', 'wo', 'workorder'])
    col_date = find_col(df.columns, ['Registration Date', 'RegDate', 'date', 'pdate', 'prdate'])
    col_shift = find_col(df.columns, ['Shift Code', 'ShiftCode', 'shift'])
    col_machine = find_col(df.columns, ['Machine', 'MachineID', 'machine_id'])
    col_len = find_col(df.columns, ['Length (m)', 'LengthMeters', 'length', 'packqty', 'len'])
    col_wt = find_col(df.columns, ['Weight (Ton)', 'WeightTon', 'weight', 'netwt', 'wt'])
    col_takeup = find_col(df.columns, ['Take-Up Drum', 'TakeUpNo', 'takeup', 'drumno', 'packno'])
    col_card = find_col(df.columns, ['Receive Card', 'ReceiveCardNo', 'cardno', 'label_no', 'label'])
    col_size = find_col(df.columns, ['Size (mm²)', 'WireSize', 'size', 'cablesize'])
    col_mat = find_col(df.columns, ['Conductor Metal', 'ConductorMaterial', 'material'])
    col_cu = find_col(df.columns, ['CU', 'CopperTon', 'cu_ton'])
    col_al = find_col(df.columns, ['AL', 'AluminumTon', 'al_ton'])
    col_op = find_col(df.columns, ['Operator Code / Name', 'Operator', 'CreatedBy', 'emp_name'])

    filtered_count = 0
    dates_found = set()

    for _, row in df.iterrows():
        raw_m = str(row.get(col_machine, '')).strip()

        machine_name = None
        if raw_m in MACHINE_ID_MAP:
            machine_name = MACHINE_ID_MAP[raw_m]
        elif raw_m.upper() in ('CN', 'CN01'):
            machine_name = 'CN'
        elif raw_m.upper() in CORE_MACHINES:
            machine_name = raw_m.upper()

        if not machine_name:
            continue

        filtered_count += 1

        wo = str(row.get(col_order, '')).strip()
        raw_date = str(row.get(col_date, '')).strip()

        date_iso = ''
        if raw_date:
            raw_date = raw_date.split('T')[0].split(' ')[0].strip()
            if '/' in raw_date:
                dp = [p.strip() for p in raw_date.split('/') if p.strip()]
                if len(dp) == 3:
                    if len(dp[0]) == 4:
                        date_iso = f"{int(dp[0]):04d}-{int(dp[1]):02d}-{int(dp[2]):02d}"
                    elif len(dp[2]) == 4:
                        p1, p2, y = int(dp[0]), int(dp[1]), int(dp[2])
                        if p1 > 12:
                            d, m = p1, p2
                        elif p2 > 12:
                            m, d = p1, p2
                        else:
                            cur_month = datetime.date.today().month
                            if p1 == cur_month and p2 != cur_month:
                                m, d = p1, p2
                            elif p2 == cur_month and p1 != cur_month:
                                d, m = p1, p2
                            else:
                                d, m = p1, p2
                        date_iso = f"{y:04d}-{m:02d}-{d:02d}"
            elif '-' in raw_date:
                dp = [p.strip() for p in raw_date.split('-') if p.strip()]
                if len(dp) == 3:
                    if len(dp[0]) == 4:
                        date_iso = f"{int(dp[0]):04d}-{int(dp[1]):02d}-{int(dp[2]):02d}"
                    elif len(dp[2]) == 4:
                        p1, p2, y = int(dp[0]), int(dp[1]), int(dp[2])
                        if p1 > 12:
                            d, m = p1, p2
                        elif p2 > 12:
                            m, d = p1, p2
                        else:
                            d, m = p1, p2
                        date_iso = f"{y:04d}-{m:02d}-{d:02d}"

        if not date_iso:
            continue

        dates_found.add(date_iso)
        dp = date_iso.split('-')
        date_display = f"{dp[2]}/{dp[1]}/{dp[0]}"

        raw_shift = str(row.get(col_shift, '')).strip().upper()
        if '1' in raw_shift:
            shift = '1'
        elif '2' in raw_shift:
            shift = '2'
        elif '3' in raw_shift:
            shift = '3'
        else:
            shift = '1'

        try:
            raw_len = float(row.get(col_len, 0) or 0)
            length = int(raw_len) if raw_len.is_integer() else round(raw_len, 2)
        except Exception:
            length = 0

        try:
            raw_wt = float(row.get(col_wt, 0) or 0)
            weight = round(raw_wt * 1000) if raw_wt < 100 else round(raw_wt)
        except Exception:
            weight = 0

        takeup = str(row.get(col_takeup, '')).strip()
        card_no = str(row.get(col_card, '')).strip() if col_card in row else ''
        size = clean_wire_size(row.get(col_size, ''))

        mat_text = str(row.get(col_mat, '')).strip()
        mat_upper = mat_text.upper()
        cu_ton = 0.0
        try:
            cu_ton = float(row.get(col_cu, 0) or 0)
        except Exception:
            cu_ton = 0.0

        al_ton = 0.0
        try:
            al_ton = float(row.get(col_al, 0) or 0)
        except Exception:
            al_ton = 0.0

        if mat_upper == 'AL' or 'AL' in mat_upper or 'الومنيوم' in mat_text or 'ألومنيوم' in mat_text:
            material = 'AL'
        elif mat_upper == 'CU' or 'CU' in mat_upper or 'نحاس' in mat_text or 'COPPER' in mat_upper:
            material = 'CU'
        elif cu_ton > 0 and cu_ton > al_ton:
            material = 'CU'
        else:
            material = 'AL'

        lk2 = wip2_map.get(wo, {})
        lk1 = wip1_map.get(wo, {})

        if not lk2 and not lk1 and wo == '177/26/10':
            lk2 = wip2_map.get('1778/26/10', {})
            lk1 = wip1_map.get('1778/26/10', {})

        cable = lk2.get('cable') or lk1.get('cable')
        if not cable or cable == 'nan':
            cable = f"0.6/1 KV,{material},{size}" if '+' in size else f"0.6/1 KV,{material},1*{size}"

        familyid = lk2.get('familyid')
        if not familyid or familyid == 'nan':
            volt = lk1.get('volt', '')
            comb = (volt + ' ' + cable).upper()
            if any(v in comb for v in ['18/30', '12/20', '19/33', '25/44']):
                familyid = 'MV'
            elif any(v in comb for v in ['66KV', '132KV', '220KV']):
                familyid = 'HV'
            else:
                familyid = 'LV'

        customer = lk2.get('customer') or lk1.get('customer')
        if not customer or customer == 'nan' or not customer.strip() or customer == '-':
            pfx = '/'.join(wo.split('/')[:2])
            customer = PREFIX_CUSTOMERS.get(pfx, '-')

        joborder = lk2.get('joborder') or lk1.get('joborder') or f"{wo}/STD/1"
        label_no = f"{wo}/STD/{card_no}" if card_no else f"{wo}/STD/{takeup}"

        raw_op = str(row.get(col_op, '') or '').strip()
        op_map = {
            'Ahmed Samy': 'أحمد سامي',
            'Mohamed hussein S': 'محمد حسين',
            'Mahmoud Mohamed Ahmed': 'محمود محمد أحمد',
            'Amr Ehab Fawzy': 'عمرو إيهاب فوزي',
            'Mohamed abdellatif Syam': 'محمد عبد اللطيف صيام',
            'mohamed Nasef': 'محمد ناصف'
        }
        operator = op_map.get(raw_op, raw_op)

        rec = {
            'workorder': wo,
            'joborder': joborder,
            'label_no': label_no,
            'cable': cable,
            'size': size,
            'raw_size': str(row.get(col_size, '')).strip(),
            'material': material,
            'familyid': familyid,
            'drumno': takeup,
            'length': length,
            'weight': weight,
            'customer': customer,
            'shift': shift,
            'machine': machine_name,
            'dateIso': date_iso,
            'dateDisplay': date_display,
            'operator': operator
        }
        records.append(rec)

    print(f"🎯 تم استخراج {len(records)} أمر شغل يخص قسم المعادن عبر التواريخ: {sorted(list(dates_found))}")
    return records, dates_found

def get_complete_existing_data(json_path='metals_data.json', html_path='index.html'):
    html_records = []
    if os.path.exists(html_path):
        try:
            with open(html_path, 'r', encoding='utf-8') as f:
                h_text = f.read()
            m = re.search(r'var METALS_DATA\s*=\s*(\[[\s\S]*?\]);', h_text)
            if m:
                html_records = json.loads(m.group(1))
        except Exception as e:
            print(f"[تحذير] خطأ في قراءة بيانات index.html: {e}")

    json_records = []
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                json_records = json.load(f)
        except Exception as e:
            print(f"[تحذير] خطأ في قراءة {json_path}: {e}")

    if len(html_records) >= len(json_records):
        print(f"ℹ️ تم تحميل {len(html_records)} سجل من النسخة المضمنة في index.html.")
        return html_records
    print(f"ℹ️ تم تحميل {len(json_records)} سجل من ملف {json_path}.")
    return json_records

def merge_and_save_json(new_records, dates_to_replace, json_path='metals_data.json', html_path='index.html'):
    """دمج السجلات الجديدة مع قاعدة البيانات وحفظها"""
    existing_data = get_complete_existing_data(json_path, html_path)

    cleaned_old = [r for r in existing_data if r.get('dateIso') not in dates_to_replace]
    print(f"📊 البيانات السابقة: {len(existing_data)} -> المتبقي بعد تنظيف التواريخ المحدثة: {len(cleaned_old)}")

    combined = cleaned_old + new_records
    combined.sort(key=lambda r: (r.get('dateIso', ''), r.get('machine', ''), r.get('shift', '')))

    for idx, r in enumerate(combined):
        r['id'] = idx + 1

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)

    js_path = os.path.splitext(json_path)[0] + '.js'
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write('var METALS_DATA = ')
        json.dump(combined, f, ensure_ascii=False)
        f.write(';\nif (typeof window !== "undefined") { window.METALS_DATA = METALS_DATA; }\nif (typeof module !== "undefined" && module.exports) { module.exports = METALS_DATA; }\n')

    embed_data_in_html(combined, html_path=html_path)

    print(f"💾 تم حفظ {len(combined)} سجل بنجاح في {json_path} و {js_path} و {html_path}!")
    return len(combined)

def embed_data_in_html(combined, html_path='index.html'):
    if not os.path.exists(html_path):
        return

    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()

    json_str = json.dumps(combined, ensure_ascii=False)
    script_block = (
        '<script id="embeddedMetalsData">\n'
        f'var METALS_DATA = {json_str};\n'
        'if (typeof window !== "undefined") { window.METALS_DATA = METALS_DATA; }\n'
        'if (typeof module !== "undefined" && module.exports) { module.exports = METALS_DATA; }\n'
        '</script>'
    )

    if '<script id="embeddedMetalsData">' in content:
        content = re.sub(
            r'<script id="embeddedMetalsData">[\s\S]*?</script>',
            script_block,
            content
        )
    elif 'metals_data.js' in content:
        content = re.sub(
            r'<script src="metals_data\.js[^"]*"></script>',
            script_block,
            content
        )
    else:
        content = content.replace(
            '<script src="config.js',
            script_block + '\n    <script src="config.js'
        )

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"📄 تم تحديث وتضمين كافة البيانات مباشرة داخل ملف {html_path} ({len(combined)} سجل)!")


# ===== دالة التوليد الثابت للواجهة والجدول في index.html لضمان العرض الفوري بنفس التنسيق والألوان =====
PRERENDER_OPERATOR_ARABIC_MAP = {
    'Ahmed Samy': 'أحمد سامي',
    'Mohamed hussein S': 'محمد حسين',
    'Mahmoud Mohamed Ahmed': 'محمود محمد أحمد',
    'Amr Ehab Fawzy': 'عمرو إيهاب فوزي',
    'Mohamed abdellatif Syam': 'محمد عبد اللطيف صيام',
    'mohamed Nasef': 'محمد ناصف'
}

def prerender_normalize_op(name):
    if not name: return ''
    trimmed = str(name).strip()
    return PRERENDER_OPERATOR_ARABIC_MAP.get(trimmed, trimmed)

def prerender_short_op(name):
    if not name: return ''
    norm = prerender_normalize_op(name)
    parts = re.split(r'\s+', norm.strip())
    if len(parts) > 2:
        if parts[1] == 'عبد' and len(parts) >= 3:
            return ' '.join(parts[:3])
        return ' '.join(parts[:2])
    return norm.strip()

def prerender_family_class(family_id):
    f = str(family_id or '').upper().strip()
    if 'MV' in f: return 'mv'
    if 'LV' in f: return 'lv'
    if 'HV' in f: return 'hv'
    return 'other'

PRERENDER_VOLT_NAMES = {
    'LV': 'Low Voltage',
    'MV': 'Medium Voltage',
    'HV': 'High Voltage',
    'CC': 'Control Cables',
    'BC': 'Building Cables',
    'BARE': 'Bare Conductor',
    'SOLID': 'Solid Conductor'
}

def prerender_index_html(html_path='index.html', json_path='metals_data.json', volt_path='wo_voltage.js'):
    if not os.path.exists(html_path) or not os.path.exists(json_path):
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        records = json.load(f)

    wo_voltage_map = {}
    if os.path.exists(volt_path):
        with open(volt_path, 'r', encoding='utf-8') as f:
            volt_js = f.read()
        m = re.search(r'var WO_VOLTAGE_MAP\s*=\s*(\{[\s\S]*?\});', volt_js)
        if m:
            wo_voltage_map = json.loads(m.group(1))

    valid_dates = sorted(list(set(r.get('dateIso') for r in records if r.get('dateIso'))))
    latest_day = valid_dates[-1] if valid_dates else '2026-11-05'

    day_rows = [r for r in records if r.get('dateIso') == latest_day]
    machines = ['RS01', 'RS02', 'RS03', 'RS04', 'RS05', 'RS06', 'CS01', 'CS02', 'DS01', 'CN']

    sum_s1 = 0
    sum_s2 = 0
    sum_s3 = 0
    sum_total_len = 0
    all_wos_set = set()
    all_sizes_set = set()
    all_volt_by_wo = {}

    rows_html = []

    for m_name in machines:
        m_rows = [r for r in day_rows if r.get('machine') == m_name]
        m_rows_s1 = [r for r in m_rows if str(r.get('shift')) == '1']
        m_rows_s2 = [r for r in m_rows if str(r.get('shift')) == '2']
        m_rows_s3 = [r for r in m_rows if str(r.get('shift')) == '3']

        s1 = sum(r.get('length', 0) for r in m_rows_s1)
        s2 = sum(r.get('length', 0) for r in m_rows_s2)
        s3 = sum(r.get('length', 0) for r in m_rows_s3)
        total_len = s1 + s2 + s3

        sum_s1 += s1
        sum_s2 += s2
        sum_s3 += s3
        sum_total_len += total_len

        machine_cell = f'''            <td style="text-align: center; vertical-align: middle;">
                <span class="machine-name">{m_name}</span>
            </td>'''

        shift_rows_list = [m_rows_s1, m_rows_s2, m_rows_s3]
        op_rows_html = []
        for i, rows in enumerate(shift_rows_list):
            shift_no = i + 1
            by_op = {}
            for r in rows:
                op = prerender_normalize_op(r.get('operator'))
                if op:
                    by_op[op] = by_op.get(op, 0) + (r.get('length') or 0)
            ops = sorted(by_op.keys(), key=lambda x: by_op[x], reverse=True)
            if ops:
                name_html = '<span class="op-sep">/</span>'.join(
                    f'<span class="op-name" title="{op}">{prerender_short_op(op)}</span>' for op in ops
                )
                full_title = ' / '.join(ops)
            else:
                name_html = '<span class="op-empty">—</span>'
                full_title = 'No operator'

            op_rows_html.append(f'''            <div class="operator-v-row" title="Shift {shift_no}: {full_title}">
                <span class="shift-badge shift-s{shift_no} op-shift-badge">S{shift_no}</span>
                <div class="op-names">{name_html}</div>
            </div>''')

        operators_cell = f'''        <td style="text-align: center; vertical-align: middle;">
            <div class="operator-v-stack">
{chr(10).join(op_rows_html)}</div>
        </td>'''

        machine_orders = []
        seen_wos = set()
        for r in m_rows:
            wo = str(r.get('workorder') or '').strip()
            if not wo or wo in seen_wos:
                continue
            seen_wos.add(wo)
            wo_rows = [row for row in m_rows if str(row.get('workorder') or '').strip() == wo]
            sizes = list(dict.fromkeys(row.get('size') for row in wo_rows if row.get('size')))
            size_str = ', '.join(sizes) if sizes else '-'
            is_cu = any(row.get('material') == 'CU' for row in wo_rows)
            mat = 'CU' if is_cu else 'AL'
            fams = list(dict.fromkeys(row.get('familyid') for row in wo_rows if row.get('familyid')))
            wo_meters = sum(row.get('length', 0) for row in wo_rows)

            plan_code = wo_voltage_map.get(wo)
            if plan_code:
                volt = {
                    'code': plan_code,
                    'cls': prerender_family_class(plan_code),
                    'from_plan': True,
                    'title': f"Master Plan: {PRERENDER_VOLT_NAMES.get(plan_code, plan_code)}"
                }
            else:
                fb = fams[0] if fams else '-'
                volt = {
                    'code': fb,
                    'cls': prerender_family_class(fb),
                    'from_plan': False,
                    'title': 'Not found in Master Plan (using production data family)'
                }

            raw_sizes = list(dict.fromkeys(str(row.get('raw_size') or row.get('rawSize') or row.get('size') or '') for row in wo_rows if row.get('raw_size') or row.get('rawSize') or row.get('size')))
            raw_sizes_str = ', '.join(raw_sizes)

            machine_orders.append({
                'workorder': wo,
                'volt': volt,
                'size': size_str,
                'rawSize': raw_sizes_str,
                'sizes': sizes,
                'material': mat,
                'isCu': is_cu,
                'families': fams,
                'meters': wo_meters
            })

            all_wos_set.add(wo)
            all_volt_by_wo[wo] = volt['code']
            for sz in sizes:
                all_sizes_set.add(sz)

        if machine_orders:
            wo_rows_html = [f'''                <div class="order-v-row" data-machine="{m_name}" data-idx="{idx}">
                    <span class="wo-pill" title="Work Order: {ord_item['workorder']}">
                        {ord_item['workorder']}
                    </span>
                </div>''' for idx, ord_item in enumerate(machine_orders)]

            qt_rows_html = [f'''                <div class="order-v-row" data-machine="{m_name}" data-idx="{idx}">
                    <span class="wo-len-km" title="Work Order: {ord_item['workorder']} | {round(ord_item['meters']):,} m">{round(ord_item['meters']):,} m</span>
                </div>''' for idx, ord_item in enumerate(machine_orders)]

            volt_rows_html = [f'''                <div class="family-v-row" data-machine="{m_name}" data-idx="{idx}">
                    <span class="family-badge {ord_item['volt']['cls']}" title="Work Order: {ord_item['workorder']} | {ord_item['volt']['title']}">{ord_item['volt']['code']}</span>
                </div>''' for idx, ord_item in enumerate(machine_orders)]

            size_rows_html = []
            for idx, ord_item in enumerate(machine_orders):
                recorded_tip = f" | Recorded: {ord_item['rawSize']}" if (ord_item['rawSize'] and ord_item['rawSize'] != ord_item['size']) else ""
                tag_cls = "cu" if ord_item['isCu'] else "al"
                size_rows_html.append(f'''                <div class="size-v-row" data-machine="{m_name}" data-idx="{idx}">
                    <span class="size-num-tag {tag_cls}" title="Work Order: {ord_item['workorder']} | Size: {ord_item['size']} mm² ({ord_item['material']}){recorded_tip}">
                        {ord_item['size']} <small class="size-unit-sub">mm²</small>
                    </span>
                </div>''')

            cond_rows_html = [f'''                <div class="conductor-v-row" data-machine="{m_name}" data-idx="{idx}">
                    <span class="material-tag {'material-copper' if ord_item['isCu'] else 'material-aluminum'}" title="Conductor: {ord_item['material']}">
                        {ord_item['material']}
                    </span>
                </div>''' for idx, ord_item in enumerate(machine_orders)]

            wo_cell = f'''            <td style="text-align: center; vertical-align: middle;">
                <div class="order-v-stack">
{chr(10).join(wo_rows_html)}</div>
            </td>'''

            qt_cell = f'''            <td style="text-align: center; vertical-align: middle;">
                <div class="order-v-stack">
{chr(10).join(qt_rows_html)}</div>
            </td>'''

            volt_cell = f'''            <td style="text-align: center; vertical-align: middle;">
                <div class="family-v-stack">
{chr(10).join(volt_rows_html)}</div>
            </td>'''

            size_cell = f'''            <td style="text-align: center; vertical-align: middle;">
                <div class="size-v-stack">
{chr(10).join(size_rows_html)}
            </div>
            </td>'''

            conductor_cell = f'''            <td style="text-align: center; vertical-align: middle;">
                <div class="conductor-v-stack">
{chr(10).join(cond_rows_html)}
            </div>
            </td>'''
        else:
            wo_cell = '<td style="text-align: center; vertical-align: middle;"><span style="color:#94a3b8; font-weight:700;">—</span></td>'
            qt_cell = '<td style="text-align: center; vertical-align: middle;"><span style="color:#94a3b8; font-weight:700;">—</span></td>'
            volt_cell = '<td style="text-align: center; vertical-align: middle;"><span style="color:#94a3b8; font-weight:700;">—</span></td>'
            size_cell = '<td style="text-align: center; vertical-align: middle;"><span style="color:#94a3b8; font-weight:700;">—</span></td>'
            conductor_cell = '<td style="text-align: center; vertical-align: middle;"><span style="color:#94a3b8; font-weight:700;">—</span></td>'

        def format_shift_m(meters):
            if meters <= 0:
                return '<span style="color:#cbd5e1">-</span>'
            return f'''<div class="shift-cell-wrapper" title="{meters / 1000:.2f} km">
                    <span class="num" style="font-weight:700;">{round(meters):,}</span>
                    <small style="font-size:0.7rem; color:#64748b;">m</small>
                </div>'''

        shift1_cell = f'<td style="text-align: center; vertical-align: middle;">{format_shift_m(s1)}</td>'
        shift2_cell = f'<td style="text-align: center; vertical-align: middle;">{format_shift_m(s2)}</td>'
        shift3_cell = f'<td style="text-align: center; vertical-align: middle;">{format_shift_m(s3)}</td>'

        # Half-up rounding to match JS toFixed(2)
        prod_km = int((total_len / 1000.0) * 100.0 + 0.5) / 100.0
        prod_km_cell = f'''            <td style="text-align: center; vertical-align: middle;" title="{round(total_len):,} m">
                <span class="num prod-km-value">{prod_km:.2f}</span>
                <span class="prod-km-unit">km/day</span>
            </td>'''

        tr = f'''<tr class="highlight-row">
{machine_cell}
{operators_cell}
{wo_cell}
{qt_cell}
{volt_cell}
{size_cell}
{conductor_cell}
{shift1_cell}
{shift2_cell}
{shift3_cell}
{prod_km_cell}
        </tr>'''
        rows_html.append(tr)

    # Total summary row
    vals = list(all_volt_by_wo.values())
    lv_cnt = vals.count('LV')
    mv_cnt = vals.count('MV')
    volt_summary_str = f"LV {lv_cnt} · MV {mv_cnt}"

    total_km = int((sum_total_len / 1000.0) * 100.0 + 0.5) / 100.0
    total_tr = f'''<tr class="total-summary-row">
        <td style="text-align: center; color: var(--accent-blue); font-size: 1.02rem; font-weight: 900;">
            Total
        </td>
        <td style="text-align: center;"></td>
        <td style="text-align: center; font-size: 0.85rem; color: #1e3a8a; font-weight: 800;">
            {len(all_wos_set)} Orders
        </td>
        <td style="text-align: center; font-size: 0.85rem; color: #1e3a8a; font-weight: 800;">
            {total_km:.2f} km
        </td>
        <td style="text-align: center; font-size: 0.8rem; color: #1e3a8a; font-weight: 800; white-space: nowrap;">
            {volt_summary_str}
        </td>
        <td style="text-align: center; font-size: 0.85rem; color: #1e3a8a; font-weight: 800;">
            {len(all_sizes_set)} Sizes
        </td>
        <td style="text-align: center;">
            <span class="material-tag material-copper">CU</span>
            <span class="material-tag material-aluminum">AL</span>
        </td>
        <td style="text-align: center;">
            <span class="num font-bold" style="color:#1e3a8a;">{round(sum_s1):,} m</span>
        </td>
        <td style="text-align: center;">
            <span class="num font-bold" style="color:#1e3a8a;">{round(sum_s2):,} m</span>
        </td>
        <td style="text-align: center;">
            <span class="num font-bold" style="color:#1e3a8a;">{round(sum_s3):,} m</span>
        </td>
        <td style="text-align: center;">
            <span class="num" style="font-size: 1.15rem; color: #1e3a8a; font-weight: 900;">
                {total_km:.2f} km/day
            </span>
        </td>
    </tr>'''
    rows_html.append(total_tr)

    new_tbody_content = '\n'.join(rows_html)

    # Calculate KPIs
    total_len_rounded = round(sum_total_len)
    total_target = 326000
    overall_perf = (sum_total_len / total_target * 100.0) if total_target > 0 else 0.0
    total_orders_kpi = len(day_rows)

    s1_k = round(sum_s1 / 1000.0)
    s2_k = round(sum_s2 / 1000.0)
    s3_k = round(sum_s3 / 1000.0)

    shifts_pct = [
        ('Shift 1', sum_s1 / sum_total_len * 100.0 if sum_total_len else 0),
        ('Shift 2', sum_s2 / sum_total_len * 100.0 if sum_total_len else 0),
        ('Shift 3', sum_s3 / sum_total_len * 100.0 if sum_total_len else 0)
    ]
    shifts_pct.sort(key=lambda x: x[1], reverse=True)
    highest_shift_text = f"{shifts_pct[0][0]} ({shifts_pct[0][1]:.1f}%) Highest"

    perf_color = 'var(--accent-green)' if overall_perf >= 85 else ('var(--accent-cyan)' if overall_perf >= 60 else 'var(--accent-orange)')
    perf_rating_text = 'Rating: Excellent' if overall_perf >= 95 else ('Rating: Very Good' if overall_perf >= 85 else ('Rating: Good' if overall_perf >= 70 else ('Rating: Acceptable' if overall_perf >= 60 else 'Rating: Under Target')))

    dt_obj = datetime.datetime.strptime(latest_day, '%Y-%m-%d')
    days_en = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    months_en = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    formatted_date_en = f"{days_en[dt_obj.weekday()]}, {months_en[dt_obj.month - 1]} {dt_obj.day}, {dt_obj.year}"
    date_badge_str = f"📅 {formatted_date_en} ({dt_obj.strftime('%d/%m/%Y')})"

    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()

    # Update Title and Subtitle to match the clean design
    html = re.sub(r'<h1>[\s\S]*?</h1>', '<h1>Productivity Dashboard</h1>', html, count=1)
    html = re.sub(r'<p class="header-subtitle">[\s\S]*?</p>', '<p class="header-subtitle">Daily Production &amp; Performance Tracking System</p>', html, count=1)

    # Clean Import Daily Sheet button text (remove emoji if present)
    html = re.sub(r'(<button class="btn-import"[^>]*>[\s\S]*?<line x1="12" y1="3" x2="12" y2="15"></line>\s*</svg>\s*)(?:📥\s*)?Import Daily Sheet', r'\1Import Daily Sheet', html)

    # Update KPI values
    html = re.sub(r'(<div class="kpi-value" id="totalLength">)[^<]*(</div>)', rf'\g<1>{total_len_rounded:,}\g<2>', html)
    html = re.sub(r'(<div class="kpi-value" id="totalTarget">)[^<]*(</div>)', rf'\g<1>{total_target:,}\g<2>', html)
    html = re.sub(r'(<div class="kpi-sub" id="totalTargetSub">)[^<]*(</div>)', r'\g<1>Target calculated on 1 day\g<2>', html)
    html = re.sub(r'<div class="kpi-value" id="deptPerformance"[^>]*>[^<]*</div>', f'<div class="kpi-value" id="deptPerformance" style="color: {perf_color};">{overall_perf:.1f}%</div>', html)
    html = re.sub(r'(<div class="kpi-sub" id="deptPerfLabel">)[^<]*(</div>)', rf'\g<1>{perf_rating_text}\g<2>', html)
    html = re.sub(r'(<div class="kpi-value" id="totalOrdersKPI">)[^<]*(</div>)', rf'\g<1>{total_orders_kpi}\g<2>', html)
    html = re.sub(r'(<div class="kpi-sub" id="ordersBreakdownSub">)[^<]*(</div>)', rf'\g<1>LV: {total_orders_kpi}\g<2>', html)

    html = re.sub(r'(<strong id="kpiShift1Val">)[^<]*(</strong>)', rf'\g<1>{s1_k}k\g<2>', html)
    html = re.sub(r'(<strong id="kpiShift2Val">)[^<]*(</strong>)', rf'\g<1>{s2_k}k\g<2>', html)
    html = re.sub(r'(<strong id="kpiShift3Val">)[^<]*(</strong>)', rf'\g<1>{s3_k}k\g<2>', html)
    html = re.sub(r'(<div class="kpi-sub" id="kpiShiftsSub">)[^<]*(</div>)', rf'\g<1>{highest_shift_text}\g<2>', html)

    html = re.sub(r'(<span id="dateDisplayLabel">)[^<]*(</span>)', rf'\g<1>{date_badge_str}\g<2>', html)
    html = re.sub(r'(<span class="active-date-pill" id="activeDatePill">)[^<]*(</span>)', rf'\g<1>📅 {formatted_date_en}\g<2>', html)
    html = re.sub(r'(<p class="section-subtitle" id="tableSubtitleDate">)[^<]*(</p>)', rf'\g<1>Daily Production Report: {formatted_date_en} | Target calculated on 1 day\g<2>', html)
    html = re.sub(r'(<span class="mini-stat-value" id="totalRecords">)[^<]*(</span>)', rf'\g<1>{total_orders_kpi}\g<2>', html)
    html = re.sub(r'(<input type="date" id="filterDateFrom"[^>]*value=")[^"]*(")', rf'\g<1>{latest_day}\g<2>', html)
    html = re.sub(r'(<input type="date" id="filterDateTo"[^>]*value=")[^"]*(")', rf'\g<1>{latest_day}\g<2>', html)

    # Replace tbody
    html = re.sub(r'<tbody id="machineShiftBody">[\s\S]*?</tbody>', f'<tbody id="machineShiftBody">\n{new_tbody_content}\n</tbody>', html)

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"🎨 تم التوليد الثابت للواجهة والجدول في {html_path} لتاريخ {latest_day} بنجاح!")


def update_html_cache_buster(html_path='index.html'):
    if not os.path.exists(html_path):
        return

    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_version = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')

    content = re.sub(
        r"const BUILD_VERSION\s*=\s*['\"][^'\"]+['\"];",
        f"const BUILD_VERSION = '{new_version}';",
        content
    )

    content = re.sub(
        r'src="metals_data\.js\?v=[^"]*"',
        f'src="metals_data.js?v={new_version}"',
        content
    )
    content = re.sub(
        r'src="config\.js\?v=[^"]*"',
        f'src="config.js?v={new_version}"',
        content
    )
    content = re.sub(
        r'src="wo_voltage\.js\?v=[^"]*"',
        f'src="wo_voltage.js?v={new_version}"',
        content
    )
    content = re.sub(
        r'src="cable3d\.js\?v=[^"]*"',
        f'src="cable3d.js?v={new_version}"',
        content
    )
    content = re.sub(
        r'src="app\.js\?v=[^"]*"',
        f'src="app.js?v={new_version}"',
        content
    )

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"🚀 تم تحديث كاش المتصفح في {html_path} إلى الإصدار: {new_version}")

def git_commit_and_push():
    import shutil
    desktop_repo = r'C:\Users\mahmoud.mohamed\Desktop\METAL'
    target_git_dir = desktop_repo if (os.path.exists(desktop_repo) and os.path.exists(os.path.join(desktop_repo, '.git'))) else None

    # Sync files to desktop repo if needed
    if target_git_dir and os.path.abspath(target_git_dir).lower() != os.path.abspath('.').lower():
        sync_files = ['index.html', 'styles.css', 'app.js', 'metals_data.json', 'metals_data.js', 'wo_voltage.js', 'config.js', 'cable3d.js', 'update_daily_data.py']
        for f in sync_files:
            if os.path.exists(f):
                shutil.copy2(f, os.path.join(target_git_dir, f))
        print(f"📋 تم نسخ الملفات المحدثة إلى مجلد Git المحلي: {target_git_dir}")

    try:
        print("\n🌐 جاري الرفع إلى GitHub...")
        cwd = target_git_dir if target_git_dir else None
        subprocess.run(['git', 'add', '-A'], cwd=cwd, check=True)
        commit_msg = f"Update metals daily data - {datetime.date.today().isoformat()}"
        subprocess.run(['git', 'commit', '-m', commit_msg], cwd=cwd, check=True)
        subprocess.run(['git', '-c', 'http.version=HTTP/1.1', 'push', 'origin', 'main'], cwd=cwd, check=True)
        print("🎉 تم الرفع بنجاح إلى GitHub Pages!")
        print("🔗 الرابط المباشر: https://mahmoudshahin1.github.io/metals-dashboard/")
    except Exception as e:
        print(f"⚠️ تنبيه: تعذر الرفع المباشر عبر الأوامر (Git): {e}")
        print("💡 يمكنك رفع التغييرات يدوياً أو مراجعة الاتصال.")

def main():
    print("=" * 60)
    print("   تحديث بيانات قسم المعادن اليومية (Metals Dashboard)")
    print("=" * 60)

    custom_file = None
    auto_push = False

    for arg in sys.argv[1:]:
        if arg == '--push':
            auto_push = True
        elif not arg.startswith('-') and custom_file is None:
            custom_file = arg

    target_file = find_target_file(custom_file)
    if not target_file:
        print("❌ لم يتم العثور على أي ملف تصدير جديد.")
        sys.exit(1)

    print(f"🎯 الملف المكتشف للتحديث: {target_file}")

    wip2_map, wip1_map = load_metadata_maps()
    df = read_export_rows(target_file)
    records, dates_found = parse_and_extract_metals(df, wip2_map, wip1_map)
    if not records:
        print("⚠️ لم يتم العثور على أي أوامر شغل لماكينات قسم المعادن في هذا الملف!")
        sys.exit(0)

    merge_and_save_json(records, dates_found)

    # ربط الماستر بلان: لو في شيت أحدث في مجلد Master_Plan بيحدّث wo_voltage.js (LV / MV لكل أمر شغل)
    try:
        import update_wo_voltage
        update_wo_voltage.auto_update()
    except SystemExit:
        pass
    except Exception as e:
        print(f"⚠️ تعذر تحديث الماستر بلان: {e}")

    update_html_cache_buster()
    prerender_index_html()

    if auto_push:
        git_commit_and_push()
    else:
        if sys.stdin.isatty():
            choice = input("\nهل تريد رفع التحديثات مباشرة إلى GitHub الآن؟ (y/n) [default: y]: ").strip().lower()
            if choice in ('', 'y', 'yes'):
                git_commit_and_push()
        else:
            print("\n💡 تم تجهيز الملفات محلياً. لرفعها إلى GitHub يمكنك تشغيل --push")

    print("\n✅ اكتمل التحديث بنجاح! شكراً لك.")

if __name__ == '__main__':
    main()
