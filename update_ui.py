# -*- coding: utf-8 -*-
"""
update_ui.py
============
Transforms Metals Department Dashboard to English and re-orders the machine table headers:
Machine | W.O | Cable Size | Conductor | Target/day | Shift 1 | Shift 2 | Shift 3 | Production km/day | Cable Type
"""

import os
import re

def update_app_js():
    with open('app.js', 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. English Date Formatter
    old_date_fn = """function formatArabicDateFull(isoString) {
    if (!isoString) return '';
    const parts = isoString.split('-');
    if (parts.length !== 3) return isoString;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const date = new Date(y, m - 1, d);
    const daysAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const dayName = daysAr[date.getDay()] || '';
    const monthName = monthsAr[m - 1] || '';
    return `${dayName}، ${d} ${monthName} ${y}`;
}"""

    new_date_fn = """function formatDateFull(isoString) {
    if (!isoString) return '';
    const parts = isoString.split('-');
    if (parts.length !== 3) return isoString;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const date = new Date(y, m - 1, d);
    const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayName = daysEn[date.getDay()] || '';
    const monthName = monthsEn[m - 1] || '';
    return `${dayName}, ${monthName} ${d}, ${y}`;
}
function formatArabicDateFull(isoString) {
    return formatDateFull(isoString);
}"""
    if 'formatDateFull(isoString)' not in code:
        code = code.replace(old_date_fn, new_date_fn)

    # 2. Performance Labels in English
    code = code.replace("if (pct >= 95) return 'ممتاز';", "if (pct >= 95) return 'Optimal';")
    code = code.replace("if (pct >= 80) return 'جيد جداً';", "if (pct >= 80) return 'Very Good';")
    code = code.replace("if (pct >= 60) return 'متوسط';", "if (pct >= 60) return 'Average';")
    code = code.replace("return 'يحتاج تحسين';", "return 'Under Target';")
    code = code.replace("`تقييم: ${getPerformanceLabel(overallPerf)}`", "`Rating: ${getPerformanceLabel(overallPerf)}`")
    code = code.replace("'بدون مستهدف معتمد'", "'No Target Set'")

    # 3. Clean Size enhancement
    clean_size_marker = "const parts = s.split('x').map(p => p.trim()).filter(Boolean);\n    if (parts.length > 0) {\n        return parts[parts.length - 1];\n    }"
    clean_size_replacement = """const stdSizes = new Set(['0.5', '0.75', '1', '1.5', '2.5', '4', '6', '10', '16', '25', '35', '50', '70', '75', '78', '95', '120', '150', '185', '240', '300', '400', '500', '630', '800', '1000', '1200', '1600', '2000']);
    const parts = s.split('x').map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) {
        if (stdSizes.has(parts[parts.length - 1])) return parts[parts.length - 1];
        for (const p of parts) {
            if (stdSizes.has(p)) return p;
        }
        return parts[parts.length - 1];
    }"""
    if clean_size_marker in code:
        code = code.replace(clean_size_marker, clean_size_replacement)

    # 4. Render Main Table with requested column layout:
    # Machine | W.O | Cable Size | Conductor | Target/day | Shift 1 | Shift 2 | Shift 3 | Production km/day | Cable Type
    render_table_regex = re.compile(r'function renderMainTable\(\)\s*\{[\s\S]*?\n\}\s*\n// ===== 10\)', re.DOTALL)
    
    new_render_main_table = """function renderMainTable() {
    const tbody = document.getElementById('machineShiftBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const distinctDays = getDistinctDaysCount();
    const machineList = getActiveVisibleMachines();

    let sumS1 = 0;
    let sumS2 = 0;
    let sumS3 = 0;
    let sumTotalLen = 0;
    let sumDailyTarget = 0;
    const allWOsSet = new Set();
    const allSizesSet = new Set();

    machineList.forEach(mName => {
        const mRows = filteredData.filter(r => r.machine === mName);

        const mRowsS1 = mRows.filter(r => r.shift === '1');
        const mRowsS2 = mRows.filter(r => r.shift === '2');
        const mRowsS3 = mRows.filter(r => r.shift === '3');

        const s1 = mRowsS1.reduce((s, r) => s + (r.length || 0), 0);
        const s2 = mRowsS2.reduce((s, r) => s + (r.length || 0), 0);
        const s3 = mRowsS3.reduce((s, r) => s + (r.length || 0), 0);
        const totalLen = mRows.reduce((s, r) => s + (r.length || 0), 0);

        sumS1 += s1;
        sumS2 += s2;
        sumS3 += s3;
        sumTotalLen += totalLen;

        const dailyTarget = getMachineDailyTarget(mName, mRows) || 0;
        sumDailyTarget += dailyTarget;

        // 1. Machine
        const machineCell = `
            <td style="text-align: left; vertical-align: middle;">
                <span class="machine-name">${mName}</span>
            </td>`;

        // 2. W.O (Work Orders)
        const distinctWOs = [...new Set(mRows.map(r => r.workorder).filter(Boolean))];
        distinctWOs.forEach(w => allWOsSet.add(w));
        const woPills = distinctWOs.map(w => `<span class="wo-pill" title="Work Order: ${w}">${w}</span>`).join('');
        const woCell = `
            <td style="text-align: left; vertical-align: middle;">
                <div class="wo-stack">${woPills || '<span style="color:#cbd5e1">-</span>'}</div>
            </td>`;

        // 3. Cable Size
        const distinctSizes = [...new Set(mRows.map(r => cleanSize(r.size, r.cable)).filter(Boolean))];
        distinctSizes.forEach(sz => allSizesSet.add(sz));
        const sizePills = distinctSizes.map(sz => {
            const isCu = mRows.some(r => cleanSize(r.size, r.cable) === sz && r.material === 'CU');
            return `<span class="size-num-tag ${isCu ? 'cu' : 'al'}">${sz}</span>`;
        }).join('');
        const sizeCell = `
            <td style="text-align: center; vertical-align: middle;">
                <div class="size-stack">${sizePills || '<span style="color:#cbd5e1">-</span>'}</div>
            </td>`;

        // 4. Conductor
        const distinctMats = [...new Set(mRows.map(r => r.material).filter(Boolean))];
        const matBadges = distinctMats.map(mat => {
            const isCu = mat === 'CU';
            return `<span class="material-tag ${isCu ? 'material-copper' : 'material-aluminum'}">${mat}</span>`;
        }).join(' ');
        const conductorCell = `
            <td style="text-align: center; vertical-align: middle;">
                ${matBadges || '<span style="color:#cbd5e1">-</span>'}
            </td>`;

        // 5. Target/day
        const dailyTargetKm = dailyTarget > 0 ? (dailyTarget / 1000).toFixed(1) : null;
        let targetCellHtml = '';
        if (dailyTargetKm !== null) {
            targetCellHtml = `
                <span class="num" style="color: var(--accent-blue); font-weight: 800; font-size: 0.92rem;">
                    ${dailyTargetKm} <small style="font-size:0.72rem; color:#64748b;">km</small>
                </span>
                <span style="font-size: 0.68rem; color: #64748b; display: block; font-family: var(--font-en);">
                    Target/day
                </span>`;
        } else {
            targetCellHtml = '<span style="color:#94a3b8; font-weight:700;">—</span>';
        }
        const targetCell = `
            <td style="text-align: center; vertical-align: middle;">
                ${targetCellHtml}
            </td>`;

        // 6, 7, 8. Shifts (Shift 1, Shift 2, Shift 3 in km)
        function formatShiftKm(meters) {
            if (meters <= 0) return '<span style="color:#cbd5e1">-</span>';
            const km = (meters / 1000).toFixed(2);
            return `
                <div class="shift-cell-wrapper" title="${meters.toLocaleString()} m">
                    <span class="num" style="font-weight:700;">${km}</span>
                    <small style="font-size:0.7rem; color:#64748b;">km</small>
                </div>`;
        }
        const shift1Cell = `<td style="text-align: center; vertical-align: middle;">${formatShiftKm(s1)}</td>`;
        const shift2Cell = `<td style="text-align: center; vertical-align: middle;">${formatShiftKm(s2)}</td>`;
        const shift3Cell = `<td style="text-align: center; vertical-align: middle;">${formatShiftKm(s3)}</td>`;

        // 9. Production km/day
        const totalKm = (totalLen / 1000).toFixed(2);
        const prodKmCell = `
            <td style="text-align: center; vertical-align: middle;" title="${totalLen.toLocaleString()} m">
                <span class="num prod-km-value">${totalKm}</span>
                <span class="prod-km-unit">km/day</span>
            </td>`;

        // 10. Cable Type (Family ID)
        const mFamilies = [...new Set(mRows.map(r => r.familyid).filter(Boolean))];
        const familyBadgesHtml = mFamilies.length > 0
            ? mFamilies.map(f => `<span class="family-badge ${getFamilyClass(f)}">${f}</span>`).join(' ')
            : '<span style="color:#cbd5e1">-</span>';
        const cableTypeCell = `
            <td style="text-align: center; vertical-align: middle;">
                ${familyBadgesHtml}
            </td>`;

        const tr = document.createElement('tr');
        tr.className = 'highlight-row';
        tr.innerHTML = machineCell + woCell + sizeCell + conductorCell + targetCell + shift1Cell + shift2Cell + shift3Cell + prodKmCell + cableTypeCell;
        tbody.appendChild(tr);
    });

    // TOTAL SUMMARY ROW
    const totalTr = document.createElement('tr');
    totalTr.className = 'total-summary-row';
    totalTr.innerHTML = `
        <td style="text-align: left; color: var(--accent-blue); font-size: 1.02rem; font-weight: 900;">
            Total
        </td>
        <td style="text-align: left; font-size: 0.82rem; color: #475569; font-weight: 700;">
            ${allWOsSet.size} Orders
        </td>
        <td style="text-align: center; font-size: 0.82rem; color: #475569;">
            ${allSizesSet.size} Sizes
        </td>
        <td style="text-align: center;">
            <span class="material-tag material-copper">CU</span>
            <span class="material-tag material-aluminum">AL</span>
        </td>
        <td style="text-align: center;">
            <span class="num" style="font-size: 1.02rem; color: #1e3a8a; font-weight: 800;">
                ${(sumDailyTarget / 1000).toFixed(1)} km
            </span>
        </td>
        <td style="text-align: center;">
            <span class="num font-bold" style="color:#1e3a8a;">${(sumS1 / 1000).toFixed(2)} km</span>
        </td>
        <td style="text-align: center;">
            <span class="num font-bold" style="color:#1e3a8a;">${(sumS2 / 1000).toFixed(2)} km</span>
        </td>
        <td style="text-align: center;">
            <span class="num font-bold" style="color:#1e3a8a;">${(sumS3 / 1000).toFixed(2)} km</span>
        </td>
        <td style="text-align: center;">
            <span class="num" style="font-size: 1.15rem; color: #1e3a8a; font-weight: 900;">
                ${(sumTotalLen / 1000).toFixed(2)} km/day
            </span>
        </td>
        <td style="text-align: center;">
            <span class="family-badge lv">LV</span>
            <span class="family-badge mv">MV</span>
        </td>
    `;
    tbody.appendChild(totalTr);
}

// ===== 10)"""

    code = render_table_regex.sub(new_render_main_table, code)

    # 5. Robust Drag & Drop Parser (handleParsedRows) - completely independent
    drag_regex = re.compile(r'function handleParsedRows\(rows, fileName\)\s*\{[\s\S]*?\n\}\s*\nfunction downloadUpdatedIndexHtml', re.DOTALL)
    
    new_drag_fn = """function handleParsedRows(rows, fileName) {
    const machineIdMap = {
        '9': 'RS01', '10': 'RS02', '11': 'RS03', '12': 'RS04', '13': 'RS05',
        '14': 'RS06', '15': 'CS01', '16': 'CS02', '17': 'DS01', '18': 'CN'
    };
    const coreMachines = new Set(['RS01', 'RS02', 'RS03', 'RS04', 'RS05', 'RS06', 'CS01', 'CS02', 'DS01', 'CN']);

    const sample = rows[0] || {};
    const keys = Object.keys(sample);

    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const findCol = (cands) => {
        for (const c of cands) {
            const nc = norm(c);
            const found = keys.find(k => norm(k) === nc);
            if (found) return found;
        }
        for (const c of cands) {
            const nc = norm(c);
            const found = keys.find(k => norm(k).includes(nc) || nc.includes(norm(k)));
            if (found) return found;
        }
        return '';
    };

    const colOrder = findCol(['Order No', 'OrderID', 'order', 'wo', 'workorder']) || 'Order No';
    const colDate = findCol(['Registration Date', 'RegDate', 'date', 'pdate']) || 'Registration Date';
    const colShift = findCol(['Shift Code', 'ShiftCode', 'shift']) || 'Shift Code';
    const colMachine = findCol(['Machine', 'MachineID', 'machine_id']) || 'Machine';
    const colLen = findCol(['Length (m)', 'LengthMeters', 'length', 'len']) || 'Length (m)';
    const colWt = findCol(['Weight (Ton)', 'WeightTon', 'weight', 'wt']) || 'Weight (Ton)';
    const colTakeup = findCol(['Take-Up Drum', 'TakeUpNo', 'takeup', 'drumno']) || 'Take-Up Drum';
    const colCard = findCol(['Receive Card', 'ReceiveCardNo', 'cardno']) || 'Receive Card';
    const colSize = findCol(['Size (mm²)', 'WireSize', 'size']) || 'Size (mm²)';
    const colMat = findCol(['Conductor Metal', 'ConductorMaterial', 'material']) || 'Conductor Metal';
    const colCu = findCol(['CU', 'CopperTon', 'cu_ton']) || 'CU';
    const colOp = findCol(['Operator Code / Name', 'Operator', 'CreatedBy']) || 'Operator Code / Name';

    const newExtracted = [];
    const datesFound = new Set();

    rows.forEach(r => {
        const rawM = String(r[colMachine] || '').trim();
        let machineName = null;
        if (machineIdMap[rawM]) machineName = machineIdMap[rawM];
        else if (rawM.toUpperCase() === 'CN01' || rawM.toUpperCase() === 'CN') machineName = 'CN';
        else if (coreMachines.has(rawM.toUpperCase())) machineName = rawM.toUpperCase();

        if (!machineName) return;

        const wo = String(r[colOrder] || '').trim();
        let rawDate = String(r[colDate] || '').trim().split('T')[0].split(' ')[0];
        let dateIso = '';
        if (rawDate) {
            if (rawDate.includes('/')) {
                const parts = rawDate.split('/').map(p => p.trim());
                if (parts.length === 3) {
                    if (parts[0].length === 4) {
                        dateIso = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                    } else if (parts[2].length === 4) {
                        const p1 = parseInt(parts[0], 10);
                        const p2 = parseInt(parts[1], 10);
                        const y = parseInt(parts[2], 10);
                        let m = p2, d = p1;
                        if (p1 > 12) { d = p1; m = p2; }
                        else if (p2 > 12) { m = p1; d = p2; }
                        else {
                            const curMonth = (new Date()).getMonth() + 1;
                            if (p1 === curMonth && p2 !== curMonth) { m = p1; d = p2; }
                            else if (p2 === curMonth && p1 !== curMonth) { d = p1; m = p2; }
                        }
                        dateIso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    }
                }
            } else if (rawDate.includes('-')) {
                const parts = rawDate.split('-').map(p => p.trim());
                if (parts.length === 3) {
                    if (parts[0].length === 4) {
                        dateIso = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                    } else if (parts[2].length === 4) {
                        dateIso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    }
                }
            }
        }

        if (!dateIso) return;
        datesFound.add(dateIso);

        const dp = dateIso.split('-');
        const dateDisplay = `${dp[2]}/${dp[1]}/${dp[0]}`;

        let rawShift = String(r[colShift] || '').trim().toUpperCase();
        let shift = '1';
        if (rawShift.includes('2')) shift = '2';
        else if (rawShift.includes('3')) shift = '3';

        let lenVal = parseFloat(r[colLen]) || 0;
        let length = Number.isInteger(lenVal) ? lenVal : Math.round(lenVal * 100) / 100;

        let wtVal = parseFloat(r[colWt]) || 0;
        let weight = wtVal < 100 ? Math.round(wtVal * 1000) : Math.round(wtVal);

        let takeup = String(r[colTakeup] || '').trim();
        let cardNo = String(r[colCard] || '').trim();
        let label_no = cardNo ? `${wo}/STD/${cardNo}` : `${wo}/STD/${takeup}`;
        let joborder = `${wo}/STD/1`;

        let rawSize = String(r[colSize] || '').trim();
        let size = cleanSize(rawSize, '');

        let matText = String(r[colMat] || '').toLowerCase();
        let cuTon = parseFloat(r[colCu]) || 0;
        let material = (matText.includes('cu') || matText.includes('copper') || matText.includes('نحاس') || cuTon > 0) ? 'CU' : 'AL';

        let cable = `0.6/1 KV,${material},1*${size}`;
        let familyid = 'LV';

        let customer = '-';
        const pfx = wo.split('/').slice(0, 2).join('/');
        if (typeof PREFIX_CUSTOMERS !== 'undefined' && PREFIX_CUSTOMERS[pfx]) {
            customer = PREFIX_CUSTOMERS[pfx];
        }

        const dateParts = dateIso.split('-');
        const dateObj = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));

        newExtracted.push({
            id: 0,
            source: 'custom_import',
            workorder: wo,
            joborder: joborder,
            label_no: label_no,
            cable: cable,
            size: size,
            material: material,
            familyid: familyid,
            drumno: takeup,
            length: length,
            weight: weight,
            operator: String(r[colOp] || '').trim(),
            customer: customer,
            shift: shift,
            machine: machineName,
            oprcode: 'STD',
            dateObj: dateObj,
            dateIso: dateIso,
            dateDisplay: dateDisplay
        });
    });

    if (newExtracted.length === 0) {
        showToast('Warning', 'No metals department machines (RS01-RS06, CS01, CS02, DS01, CN) found in this file!', '⚠️');
        return;
    }

    rawData = rawData.filter(r => !datesFound.has(r.dateIso)).concat(newExtracted);
    rawData.sort((a, b) => (a.dateIso || '').localeCompare(b.dateIso || '') || (a.machine || '').localeCompare(b.machine || ''));
    rawData.forEach((r, idx) => { r.id = idx + 1; });

    try {
        let existingLocal = [];
        const localSaved = localStorage.getItem('metals_dashboard_local_imports');
        if (localSaved) {
            existingLocal = JSON.parse(localSaved);
            if (!Array.isArray(existingLocal)) existingLocal = [];
        }
        const updatedLocal = existingLocal.filter(r => !datesFound.has(r.dateIso)).concat(newExtracted);
        localStorage.setItem('metals_dashboard_local_imports', JSON.stringify(updatedLocal));
    } catch (e) {
        console.warn('Could not save to localStorage:', e);
    }

    finalizeDataSetup();

    const datesList = Array.from(datesFound).sort().join(', ');
    showToast(
        'Daily Sheet Processed Successfully!',
        `Added ${newExtracted.length} production orders for Metals machines on [${datesList}]. Dashboard is fully updated.`,
        '🎉',
        `
        <button class="btn-toast-action" onclick="downloadUpdatedIndexHtml()">📥 Download Updated index.html</button>
        <button class="btn-toast-action" onclick="downloadUpdatedMetalsJson()">💾 Download metals_data.json</button>
        <button class="btn-toast-action" style="background: #475569;" onclick="clearLocalImportedData()">🔄 Reset to Base Data</button>
        `
    );
}

function downloadUpdatedIndexHtml"""

    code = drag_regex.sub(new_drag_fn, code)

    # Toast title in processDailyFile
    code = code.replace("showToast('جاري قراءة الملف', `جاري تحليل محتويات ${name}...`, '⏳');",
                        "showToast('Reading File', `Analyzing ${name}...`, '⏳');")

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(code)

    print('app.js updated successfully!')

if __name__ == '__main__':
    update_app_js()
