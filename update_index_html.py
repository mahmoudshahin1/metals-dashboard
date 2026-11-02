# -*- coding: utf-8 -*-
"""
update_index_html.py
====================
Updates index.html to English and sets the new column header structure:
Machine | W.O | Cable Size | Conductor | Target/day | Shift 1 | Shift 2 | Shift 3 | Production km/day | Cable Type
"""

import re

def update_html():
    with open('index.html', 'r', encoding='utf-8') as f:
        html = f.read()

    # 1. HTML tag
    html = re.sub(r'<html\s+lang="ar"\s+dir="rtl">', '<html lang="en" dir="ltr">', html)
    html = re.sub(r'<title>.*?</title>', '<title>Metals Department Productivity Dashboard</title>', html)
    html = re.sub(r'<meta name="description" content=".*?">', '<meta name="description" content="Comprehensive productivity dashboard for Metals Department - machine, shift, and conductor performance tracking">', html)

    # 2. Loading screen
    html = html.replace('جاري قراءة وتحليل بيانات قسم المعادن من شيت الإنتاج...', 'Parsing and loading metals department production records...')

    # 3. Header
    html = html.replace('<h1>داشبورد إنتاجية قسم المعادن</h1>', '<h1>Metals Department Productivity Dashboard</h1>')
    html = html.replace('<p class="header-subtitle">Metals Department Daily Production &amp; Performance Dashboard (wip001_pp &amp; wip002_pr)</p>',
                        '<p class="header-subtitle">Daily Production &amp; Performance Tracking System</p>')
    html = html.replace('<span class="source-badge">📁 المصدر: WIP 1 &amp; Metal (13 أكتوبر 2026)</span>',
                        '<span class="source-badge">📁 Source: Daily Cable Production Records</span>')
    html = html.replace('title="تحديث فوري وتجاوز الكاش">🔄 تحديث</button>', 'title="Reload data &amp; bypass cache">🔄 Refresh</button>')
    html = html.replace('<span class="mini-stat-label">سجل إنتاج</span>', '<span class="mini-stat-label">Production Records</span>')
    html = html.replace('<span class="mini-stat-label" id="machinesCountLabel">ماكينات أساسية</span>', '<span class="mini-stat-label" id="machinesCountLabel">Core Machines</span>')

    # Header action buttons
    html = html.replace('📥 شيت اليوم الجديد', '📥 Import Daily Sheet')
    html = html.replace('title="سحب أو رفع شيت اليوم الجديد (CSV أو Excel)"', 'title="Drag &amp; drop or browse new daily production sheet (CSV or Excel)"')
    html = html.replace('تصدير إكسل', 'Export Excel')
    html = html.replace('title="تحميل شيت إكسل كامل"', 'title="Download full Excel report"')
    html = html.replace('تصدير PDF', 'Export PDF')
    html = html.replace('title="تحميل تقرير PDF مباشر"', 'title="Download direct PDF report"')
    html = html.replace('طباعة', 'Print')
    html = html.replace('title="طباعة التقرير"', 'title="Print this report"')

    # 4. Filters Section
    html = html.replace('<label>فترة الإنتاج:</label>', '<label>Production Period:</label>')
    html = html.replace('<span class="date-label-sub">من:</span>', '<span class="date-label-sub">From:</span>')
    html = html.replace('<span class="date-label-sub">إلى:</span>', '<span class="date-label-sub">To:</span>')
    html = html.replace('title="عرض إنتاج اليوم الأخير فقط">اليوم الأخير</button>', 'title="Show latest production day only">Latest Day</button>')
    html = html.replace('title="عرض كامل الفترة المسجلة">الفترة كلها</button>', 'title="Show full recorded period">All Period</button>')
    html = html.replace('<label>الشفت</label>', '<label>Shift</label>')
    html = html.replace('<option value="all">جميع الشفتات (1, 2, 3)</option>', '<option value="all">All Shifts (1, 2, 3)</option>')
    html = html.replace('<label>المادة (Conductor)</label>', '<label>Conductor (Material)</label>')
    html = html.replace('<option value="all">جميع المواد (AL + CU)</option>', '<option value="all">All Materials (AL + CU)</option>')
    html = html.replace('<option value="AL">ألومنيوم (AL)</option>', '<option value="AL">Aluminum (AL)</option>')
    html = html.replace('<option value="CU">نحاس (CU)</option>', '<option value="CU">Copper (CU)</option>')
    html = html.replace('<label>الماكينة</label>', '<label>Machine</label>')
    html = html.replace('إعادة ضبط', 'Reset Filters')

    # 5. KPI Cards
    html = html.replace('<div class="kpi-label">إجمالي الإنتاج الفعلي (متر)</div>', '<div class="kpi-label">Total Actual Production (km)</div>')
    html = html.replace('<div class="kpi-sub" id="totalLengthSub">المحقق في الفترة المختارة</div>', '<div class="kpi-sub" id="totalLengthSub">Achieved in selected period</div>')
    html = html.replace('<div class="kpi-label">المستهدف القياسي للفترة (متر)</div>', '<div class="kpi-label">Standard Period Target (km)</div>')
    html = html.replace('<div class="kpi-sub" id="totalTargetSub">المستهدف محسوب على 1 يوم</div>', '<div class="kpi-sub" id="totalTargetSub">Target based on selected period</div>')
    html = html.replace('<div class="kpi-label">النسبة العامة للماكينات (Overall Performance)</div>', '<div class="kpi-label">Overall Machine Performance</div>')
    html = html.replace('<div class="kpi-sub" id="deptPerfLabel">تقييم: متوسط</div>', '<div class="kpi-sub" id="deptPerfLabel">Rating: Good</div>')
    html = html.replace('<div class="kpi-label">أوامر التشغيل المسجلة</div>', '<div class="kpi-label">Production Work Orders</div>')
    html = html.replace('<div class="kpi-label">إنتاج الشفتات المجمع (متر)</div>', '<div class="kpi-label">Aggregated Shift Output (km)</div>')

    # 6. Main Machines Table Section
    html = html.replace('جدول إنتاجية الماكينات والشفتات', 'Machine Productivity &amp; Shifts Summary')
    html = html.replace('عرض البناشر (BN: 5 ماكينات)', 'Show Bunchers (BN: 5 Machines)')
    html = html.replace('title="إظهار أو إخفاء ماكينات البناشر"', 'title="Show or hide buncher machines"')

    # Replace the table header and clear pre-rendered tbody
    old_table_regex = re.compile(
        r'<table class="data-table" id="machineShiftTable">[\s\S]*?</table>',
        re.DOTALL
    )

    new_table_html = """<table class="data-table" id="machineShiftTable">
                        <thead>
                            <tr>
                                <th style="width: 100px; text-align: left;">Machine</th>
                                <th style="text-align: left; min-width: 160px;">W.O</th>
                                <th style="text-align: center; width: 120px;">Cable Size</th>
                                <th style="text-align: center; width: 100px;">Conductor</th>
                                <th style="text-align: center; width: 120px;">Target/day</th>
                                <th style="text-align: center; width: 110px;">Shift 1</th>
                                <th style="text-align: center; width: 110px;">Shift 2</th>
                                <th style="text-align: center; width: 110px;">Shift 3</th>
                                <th style="text-align: center; width: 160px;">Production km/day</th>
                                <th style="text-align: center; width: 110px;">Cable Type</th>
                            </tr>
                        </thead>
                        <tbody id="machineShiftBody">
                        </tbody>
                    </table>"""

    html = old_table_regex.sub(new_table_html, html)

    # 7. Unassigned Alert Bar
    html = html.replace('<span>صفوف بدون ماكينة: <strong id="alertUnassignedMach">0 صف / 0 متر</strong></span>',
                        '<span>Unassigned Machine: <strong id="alertUnassignedMach">0 rows / 0 km</strong></span>')
    html = html.replace('<span>صفوف بدون شيفت: <strong id="alertUnassignedShift">0 صف / 0 متر</strong></span>',
                        '<span>Unassigned Shift: <strong id="alertUnassignedShift">0 rows / 0 km</strong></span>')

    # 8. Detailed Orders Table Section
    html = html.replace('سجل أوامر التشغيل والإنتاج التفصيلي', 'Detailed Production Orders Log')
    html = html.replace('placeholder="بحث بـ Work Order, Size, Customer, Drum No, Machine..."',
                        'placeholder="Search by Work Order, Size, Customer, Drum No, Machine..."')
    html = html.replace('<option value="all">جميع الشفتات</option>', '<option value="all">All Shifts</option>')
    html = html.replace('<option value="all">جميع المواد</option>', '<option value="all">All Materials</option>')
    html = html.replace('<option value="25">25 أمر</option>', '<option value="25">25 rows</option>')
    html = html.replace('<option value="50">50 أمر</option>', '<option value="50">50 rows</option>')
    html = html.replace('<option value="100">100 أمر</option>', '<option value="100">100 rows</option>')
    html = html.replace('<option value="all">عرض الكل</option>', '<option value="all">Show All</option>')

    # Clear pre-rendered detail table body
    old_detail_body_regex = re.compile(r'<tbody id="detailTableBody">[\s\S]*?</tbody>', re.DOTALL)
    html = old_detail_body_regex.sub('<tbody id="detailTableBody"></tbody>', html)

    # 9. Footer
    html = html.replace('داشبورد إنتاجية قسم المعادن © 2026 | نظام تتبع الإنتاجية والأداء الفعلي من شيت wip001_pp &amp; wip002_pr',
                        'Metals Department Productivity Dashboard © 2026 | Daily Cable Production Tracking System')

    # 10. Drag & Drop Overlay
    html = html.replace('<div class="drag-drop-title">أفلت شيت اليوم الجديد هنا</div>',
                        '<div class="drag-drop-title">Drop Today\'s Production Sheet Here</div>')
    html = html.replace('<div class="drag-drop-desc">يدعم ملفات CSV أو Excel (مثل Orders_Export_*.csv أو .xlsx)<br>سيتم استخراج ماكينات قسم المعادن وتحديث الداشبورد فورياً!</div>',
                        '<div class="drag-drop-desc">Supports daily export sheets (e.g. Cable_Production_Records_*.csv or .xlsx)<br>Metals department machines (RS01-RS06, CS01, CS02, DS01, CN) will be parsed and updated instantly!</div>')

    # 11. Toast notification
    html = html.replace('<div class="toast-title" id="toastTitle">جاري التجهيز</div>',
                        '<div class="toast-title" id="toastTitle">Processing</div>')
    html = html.replace('<div class="toast-message" id="toastMessage">جاري إنشاء ملف index.html المدمج بالبيانات الجديدة...</div>',
                        '<div class="toast-message" id="toastMessage">Updating dashboard with latest production data...</div>')
    html = html.replace('title="إغلاق">×', 'title="Close">×')

    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(html)

    print('index.html transformed to English with new table headers successfully!')

if __name__ == '__main__':
    update_html()
