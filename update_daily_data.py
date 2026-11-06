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
    try:
        print("\n🌐 جاري الرفع إلى GitHub...")
        subprocess.run(['git', 'add', '-A'], check=True)
        commit_msg = f"Update metals daily data - {datetime.date.today().isoformat()}"
        subprocess.run(['git', 'commit', '-m', commit_msg], check=True)
        subprocess.run(['git', '-c', 'http.version=HTTP/1.1', 'push', 'origin', 'main'], check=True)
        print("🎉 تم الرفع بنجاح إلى GitHub Pages!")
        print("🔗 الرابط المباشر: https://aefawzy17-dot.github.io/METAL/")
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
