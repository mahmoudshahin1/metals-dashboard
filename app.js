// ===== Metals Department Dashboard (wip001_pp & wip002_pr) =====
// Primary production data strictly from wip001_pp.xls (complete coverage, operator names, actual drums)
// Metadata lookup (Customer names & Family IDs) seamlessly integrated from wip002_pr.xls

let rawData = [];
let filteredData = [];
let minDateIso = '';
let maxDateIso = '';
let showBunchers = false; // Bunchers (BN) hidden by default
const SHOW_MACHINE_OPERATORS = false; // Isolated/hidden as requested
let currentPage = 1;
let currentDetailData = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initDragAndDrop();
});

// ===== Helper Machine Lists =====
function getCoreMachines() {
    return (typeof DEFAULT_MACHINES !== 'undefined' && Array.isArray(DEFAULT_MACHINES))
        ? DEFAULT_MACHINES
        : ['RS01', 'RS02', 'RS03', 'RS04', 'RS05', 'RS06', 'CS01', 'CS02', 'DS01', 'CN'];
}

function getBuncherMachines() {
    return (typeof BUNCHER_MACHINES !== 'undefined' && Array.isArray(BUNCHER_MACHINES))
        ? BUNCHER_MACHINES
        : ['BN01', 'BN02', 'BN06', 'BN07', 'BN08'];
}

function getAllowedDepartmentMachines() {
    return [...getCoreMachines(), ...getBuncherMachines()];
}

function getActiveVisibleMachines() {
    return showBunchers ? getAllowedDepartmentMachines() : getCoreMachines();
}

// ===== Arabic Date Formatting Helper =====
function formatDateFull(isoString) {
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
}

// Operator name translation & normalization map
const OPERATOR_ARABIC_MAP = {
    'Ahmed Samy': 'أحمد سامي',
    'Mohamed hussein S': 'محمد حسين',
    'Mahmoud Mohamed Ahmed': 'محمود محمد أحمد',
    'Amr Ehab Fawzy': 'عمرو إيهاب فوزي',
    'Mohamed abdellatif Syam': 'محمد عبد اللطيف صيام',
    'mohamed Nasef': 'محمد ناصف'
};

function normalizeOperatorName(name) {
    if (!name) return '';
    const trimmed = String(name).trim();
    return OPERATOR_ARABIC_MAP[trimmed] || trimmed;
}

// Operator short name helper (first 2 words for badges)
function shortOperatorName(name) {
    if (!name) return '';
    const norm = normalizeOperatorName(name);
    const parts = norm.trim().split(/\s+/);
    if (parts.length > 2) {
        if (parts[1] === 'عبد' && parts.length >= 3) {
            return parts.slice(0, 3).join(' ');
        }
        return parts.slice(0, 2).join(' ');
    }
    return norm.trim();
}

// ===== 1) Fast Data Loading (Precompiled JS/JSON with Excel Fallback) =====
function loadData() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.classList.remove('hidden');

    try {
        // 1) إذا كانت البيانات محملة مسبقاً عبر سكربت metals_data.js (يعمل مباشرة وبدون سيرفر محلي عند فتح index.html مباشرة من الديسكتوب)
        if (typeof window.METALS_DATA !== 'undefined' && Array.isArray(window.METALS_DATA) && window.METALS_DATA.length > 0) {
            console.log(`[Data] Loaded ${window.METALS_DATA.length} records successfully.`);
            initFromPrecompiled(window.METALS_DATA);
            if (loadingScreen) {
                setTimeout(() => {
                    loadingScreen.classList.add('hidden');
                }, 150);
            }
            return;
        }
    } catch (err) {
        console.error('[loadData error]:', err);
        if (loadingScreen) {
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
            }, 150);
        }
    }

    const vParam = typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : Date.now();

    fetch('metals_data.json?v=' + vParam)
        .then(res => {
            if (!res.ok) throw new Error('metals_data.json not found');
            return res.json();
        })
        .then(data => {
            if (!Array.isArray(data) || data.length === 0) throw new Error('Empty JSON data');
            initFromPrecompiled(data);
            if (loadingScreen) {
                setTimeout(() => {
                    loadingScreen.classList.add('hidden');
                }, 150);
            }
        })
        .catch(err => {
            console.log('Falling back to Excel parsing:', err.message);
            loadFromExcel();
        });
}

function initFromPrecompiled(data) {
    let combinedData = Array.isArray(data) ? [...data] : [];

    // دمج أي بيانات يوم جديد قام المستخدم برفعها محلياً في هذا المتصفح
    try {
        const localSaved = localStorage.getItem('metals_dashboard_local_imports');
        if (localSaved) {
            const parsedCustom = JSON.parse(localSaved);
            if (Array.isArray(parsedCustom) && parsedCustom.length > 0) {
                const customDates = new Set(parsedCustom.map(r => r.dateIso).filter(Boolean));
                combinedData = combinedData.filter(r => !customDates.has(r.dateIso)).concat(parsedCustom);
                console.log(`[LocalStorage] تم استرجاع ودمج ${parsedCustom.length} سجل مستورد محلياً.`);
            }
        }
    } catch (e) {
        console.warn('تعذر استرجاع البيانات المستوردة محلياً:', e);
    }

    rawData = combinedData.map((r, index) => {
        const parts = String(r.dateIso || '').split('-');
        let dateObj = null;
        if (parts.length === 3) {
            dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }
        return {
            id: index + 1,
            source: 'metals_data',
            workorder: String(r.workorder || '').trim(),
            joborder: String(r.joborder || '').trim(),
            label_no: String(r.label_no || '').trim(),
            cable: String(r.cable || '').trim(),
            size: cleanSize(r.size, r.cable),
            rawSize: String(r.raw_size || r.rawSize || r.size || '').trim(),
            material: String(r.material || '').trim(),
            familyid: String(r.familyid || '').trim(),
            drumno: String(r.drumno || '').trim(),
            length: parseFloat(r.length) || 0,
            weight: parseFloat(r.weight) || 0,
            operator: normalizeOperatorName(r.operator || r.emp_name || r.CreatedBy || ''),
            customer: String(r.customer || '').trim() || '-',
            shift: String(r.shift || '').trim(),
            machine: String(r.machine || '').trim(),
            oprcode: 'STD',
            dateObj,
            dateIso: r.dateIso,
            dateDisplay: r.dateDisplay
        };
    });

    finalizeDataSetup();
}

function loadFromExcel() {
    const loadingScreen = document.getElementById('loadingScreen');
    Promise.all([
        fetch('wip001_pp.xls?v=' + Date.now()).then(res => {
            if (!res.ok) throw new Error('تعذر تحميل ملف wip001_pp.xls');
            return res.arrayBuffer();
        }),
        fetch('wip002_pr.xls?v=' + Date.now()).then(res => {
            if (!res.ok) return null;
            return res.arrayBuffer();
        }).catch(() => null),
        fetch('metal.csv?v=' + Date.now()).then(res => {
            if (!res.ok) return null;
            return res.text();
        }).catch(() => null)
    ])
        .then(([buf1, buf2, metalCsvText]) => {
            const wb1 = XLSX.read(buf1, { type: 'array' });
            const sheet1 = wb1.Sheets[wb1.SheetNames[0] || 'wip001_pp'];
            const rows1 = XLSX.utils.sheet_to_json(sheet1, { defval: '' });

            let rows2 = [];
            if (buf2) {
                try {
                    const wb2 = XLSX.read(buf2, { type: 'array' });
                    const sheet2 = wb2.Sheets[wb2.SheetNames[0] || 'wip002_pr'];
                    rows2 = XLSX.utils.sheet_to_json(sheet2, { defval: '' });
                } catch (e) {
                    console.warn('Could not parse wip002_pr.xls lookup:', e);
                }
            }

            if (!rows1 || rows1.length === 0) {
                throw new Error('ملف wip001_pp.xls فارغ أو تعذر قراءة الصفوف.');
            }

            processData(rows1, rows2, metalCsvText);

            if (loadingScreen) {
                setTimeout(() => {
                    loadingScreen.classList.add('hidden');
                }, 300);
            }
        })
        .catch(err => {
            console.error('Error loading data:', err);
            if (loadingScreen) {
                loadingScreen.innerHTML = `
                <div class="loader-container">
                    <div style="color: #dc2626; font-size: 1.25rem; font-weight: 800; font-family: var(--font-ar);">
                        خطأ في قراءة ملفات الإنتاج (wip001_pp)
                    </div>
                    <div style="color: #64748b; margin-top: 8px; font-size: 0.9rem; font-family: var(--font-en);">
                        ${err.message}
                    </div>
                    <div style="margin-top: 16px;">
                        <button onclick="location.reload()" style="padding: 6px 16px; border-radius: 6px; background: var(--accent-blue); color: white; border: none; cursor: pointer; font-family: var(--font-ar); font-weight: 700;">
                            إعادة المحاولة
                        </button>
                    </div>
                </div>
            `;
            }
        });
}

// ===== 2) Process and Normalize Data =====
function processData(rows1, rows2, metalCsvText) {
    const allowedDeptMachines = getAllowedDepartmentMachines();

    // 1) Build metadata lookup map from wip002_pr.xls by workorder
    const wip002Lookup = {};
    if (Array.isArray(rows2)) {
        rows2.forEach(r => {
            const wo = String(r.workorder || '').trim();
            if (!wo && !wip002Lookup[wo]) {
                wip002Lookup[wo] = {
                    familyid: String(r.familyid || '').trim().toUpperCase(),
                    customer: String(r.customer || '').trim(),
                    conductor: String(r.conductor || '').trim().toUpperCase(),
                    joborder: String(r.joborder || '').trim()
                };
            }
        });
    }

    // 1.5) Integrate rows from metal.csv if present (auto-detect new days like 13/10 without duplicate)
    if (metalCsvText && typeof Papa !== 'undefined') {
        try {
            const parsedMetal = Papa.parse(metalCsvText, { header: true, skipEmptyLines: true });
            const machineIdMap = {
                '9': 'RS01', '10': 'RS02', '11': 'RS03', '12': 'RS04', '13': 'RS05',
                '14': 'RS06', '15': 'CS01', '16': 'CS02', '17': 'DS01', '18': 'CN'
            };
            const supervisorMap = {
                '172': 'محمد سامى مصطفى',
                '173': 'تامر السيد الشرقاوى',
                '174': 'حازم حامد وهبة',
                '107': 'محمود محمد احمد'
            };
            const existingKeys = new Set(rows1.map(r => `${r.wo}_${r.packno}_${String(r.machine || '').toUpperCase()}_${parseFloat(r.packqty)}`));

            parsedMetal.data.forEach(r => {
                const mName = machineIdMap[r.MachineID];
                if (!mName) return;
                const wo = String(r.OrderID || '').trim();
                const packno = String(r.TakeUpNo || '').trim();
                const packqty = parseFloat(r.LengthMeters) || 0;
                const key = `${wo}_${packno}_${mName}_${packqty}`;
                if (!existingKeys.has(key)) {
                    existingKeys.add(key);
                    const shiftNum = r.ShiftCode === 'S1' ? '1' : (r.ShiftCode === 'S2' ? '2' : (r.ShiftCode === 'S3' ? '3' : r.ShiftCode));
                    const isCu = r.ConductorMaterial === 'نحاس' || (parseFloat(r.CopperTon) || 0) > 0;
                    const dscrpt = isCu ? 'CU' : 'AL';
                    rows1.push({
                        label_no: r.ReceiveCardNo ? `${wo}/STD/${r.ReceiveCardNo}` : `${wo}/STD/${packno}`,
                        prdcode: 'P',
                        packno: packno,
                        packqty: packqty,
                        netwt: Math.round((parseFloat(r.WeightTon) || 0) * 1000),
                        prdate: r.RegDate,
                        shift: shiftNum,
                        emp_name: supervisorMap[r.SupervisorID] || r.CreatedBy || '',
                        wo: wo,
                        job_no: `${wo}/STD/1`,
                        size: String(r.WireSize || '').trim(),
                        dscrpt: dscrpt,
                        oprcode: 'STD',
                        oprseq: '03',
                        machine: mName
                    });
                }
            });
        } catch (e) {
            console.warn('Could not parse metal.csv:', e);
        }
    }

    // 2) Filter wip001_pp rows strictly to Metals Department machines
    const deptRows1 = rows1.filter(r => {
        const m = String(r.machine || '').trim().toUpperCase();
        return allowedDeptMachines.includes(m) || !m;
    });

    rawData = deptRows1.map((r, index) => {
        const workorder = String(r.wo || '').trim();
        const joborder = String(r.job_no || '').trim();
        const label_no = String(r.label_no || '').trim();
        const cable = String(r.ecblnm || '').trim();
        const drumno = String(r.packno || '').trim();
        const length = parseFloat(r.packqty) || 0;
        const weight = parseFloat(r.netwt) || 0;
        const operator = String(r.emp_name || '').trim();
        const shiftRaw = r.shift !== undefined && r.shift !== null && r.shift !== '' ? String(r.shift).trim() : '';
        const machine = String(r.machine || '').trim().toUpperCase();
        const oprcode = String(r.oprcode || 'STD').trim();

        // Size: clean from r.size or fallback to cable regex
        const size = cleanSize(r.size, cable);

        // Metadata lookup from wip002
        const lookup = wip002Lookup[workorder] || {};

        // Material extraction (AL or CU)
        const material = extractMaterialFromCable(cable, r.dscrpt, lookup.conductor);

        // Family ID: lookup or derive from volt / cable
        const familyid = lookup.familyid || extractFamilyFromCable(cable, r.volt);

        // Customer: lookup from wip002 or fallback to short_name / cust_no
        const customer = lookup.customer || String(r.short_name || '').trim() || '-';

        // Date extraction (prdate)
        const dateObj = parseExcelDate(r.prdate);
        const dateIso = dateObj ? formatDateToIso(dateObj) : '';
        const dateDisplay = dateObj ? formatDateToDisplay(dateObj) : '';

        return {
            id: index + 1,
            source: 'wip001',
            workorder,
            joborder,
            label_no,
            cable,
            size,
            material,
            familyid,
            drumno,
            length,
            weight,
            operator,
            customer,
            shift: shiftRaw ? String(parseInt(shiftRaw) || shiftRaw) : '',
            machine,
            oprcode,
            dateObj,
            dateIso,
            dateDisplay
        };
    });

    finalizeDataSetup();
}

function finalizeDataSetup() {
    // Detect distinct dates dynamically
    const validDates = [...new Set(rawData.map(r => r.dateIso).filter(Boolean))].sort();
    const octDates = validDates.filter(d => d >= '2026-10-01');
    if (octDates.length > 0) {
        minDateIso = octDates[0];
        maxDateIso = octDates[octDates.length - 1];
    } else if (validDates.length > 0) {
        minDateIso = validDates[0];
        maxDateIso = validDates[validDates.length - 1];
    } else {
        minDateIso = '2026-10-01';
        maxDateIso = '2026-10-13';
    }

    // Set initial date filter values (default: Latest Day fixed as requested, user can change/search freely)
    const inputFrom = document.getElementById('filterDateFrom');
    const inputTo = document.getElementById('filterDateTo');
    if (inputFrom) inputFrom.value = maxDateIso;
    if (inputTo) inputTo.value = maxDateIso;

    const btnLatest = document.getElementById('btnLatestDay');
    const btnAll = document.getElementById('btnAllPeriod');
    if (btnLatest) btnLatest.classList.add('active');
    if (btnAll) btnAll.classList.remove('active');

    // Populate dropdowns
    populateMachineDropdowns();
    populateFamilyDropdown();

    // Initial render
    applyFilters();
    if (typeof initCable3D === 'function') {
        initCable3D(filteredData);
    }
}

// ===== 3) Extraction Rules for Size, Material, and Family =====
function cleanSingleSize(str) {
    let s = String(str || '').trim();
    if (!s || s === '-' || s === '  -   -') return '';
    s = s.replace(/\s*MM2?$/i, '').replace(/²/g, '').trim();

    // If ratio (/), take the main portion before /
    // e.g. 150/25 -> 150, 35/6 -> 35
    if (s.includes('/')) {
        s = s.split('/')[0].trim();
    }

    // Normalize multipliers (*, X, × to lowercase x)
    s = s.replace(/[\*X×]/g, 'x');
    s = s.replace(/\s*x\s*/g, 'x');

    const stdSizes = new Set([
        '0.5', '0.75', '1', '1.5', '2.5', '4', '6', '10', '16', '25', '35',
        '50', '70', '75', '78', '95', '120', '150', '185', '240', '300',
        '400', '500', '630', '800', '1000', '1200', '1400', '1600', '1800', '2000', '2500'
    ]);

    const parts = s.split('x').map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) {
        const lastPart = parts[parts.length - 1];
        if (stdSizes.has(lastPart)) return lastPart;
        if (/^\d+(\.\d+)?$/.test(lastPart)) return lastPart;
        for (let i = parts.length - 1; i >= 0; i--) {
            if (stdSizes.has(parts[i])) return parts[i];
        }
        return lastPart;
    }

    return s;
}

function cleanSize(rawSize, cable) {
    let s = String(rawSize || '').trim();
    if (!s || s === '-' || s === '  -   -') {
        s = extractSizeFromCable(cable);
    }
    if (!s || s === '-' || s === '  -   -') return '-';

    s = s.replace(/\s*MM2?$/i, '').replace(/²/g, '').trim();

    // If composite (+), e.g. 3x240+120, 240+120, 120+240, 3x150+70, 3x50+25, 3x70+35
    // Clean each portion around '+' and preserve full size specification
    if (s.includes('+')) {
        const subParts = s.split('+').map(part => cleanSingleSize(part)).filter(Boolean);
        if (subParts.length > 0) {
            return subParts.join('+');
        }
    }

    const cleaned = cleanSingleSize(s);
    return cleaned || extractSizeFromCable(cable) || '-';
}

function extractSizeFromCable(cable) {
    if (!cable) return '-';
    const m = cable.match(/\b(\d+(?:\.\d+)?\*(?:\d+(?:\.\d+)?\*)*\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)?(?:\/\d+(?:\.\d+)?)?)\b/);
    if (m) {
        let s = m[1];
        if (s.includes('+')) {
            const subParts = s.split('+').map(part => {
                const p = part.split('*').map(x => x.trim()).filter(Boolean);
                return p.length > 0 ? p[p.length - 1] : part;
            });
            return subParts.join('+');
        }
        if (s.includes('/')) s = s.split('/')[0].trim();
        const parts = s.split('*').map(p => p.trim()).filter(Boolean);
        return parts.length > 0 ? parts[parts.length - 1] : s;
    }
    const mSingle = cable.match(/,(\d+(?:\.\d+)?)(?:,|$)/);
    if (mSingle && !mSingle[1].includes('/')) {
        return mSingle[1];
    }
    return '-';
}

function extractMaterialFromCable(cable, dscrpt, conductor) {
    const combined = ((dscrpt || '') + ' ' + (cable || '')).toUpperCase();
    if (combined.includes('COPPER') || combined.includes('CU ') || combined.includes(',CU,') || combined.includes(',CU ') || combined.startsWith('CU')) {
        return 'CU';
    }
    if (combined.includes('AL') || combined.includes('ACSR') || combined.includes('ALUMIN')) {
        return 'AL';
    }
    if (conductor) {
        const c = String(conductor).trim().toUpperCase();
        if (c.startsWith('C') || c === 'CU') return 'CU';
        if (c.startsWith('A') || c === 'AL') return 'AL';
    }
    return 'AL';
}

function extractFamilyFromCable(cable, volt) {
    const combined = ((volt || '') + ' ' + (cable || '')).toUpperCase();
    if (combined.includes('18/30') || combined.includes('12/20') || combined.includes('19/33') || combined.includes('25/44')) return 'MV';
    if (combined.includes('0.6/1') || combined.includes('450/750') || combined.includes('300/500') || combined.includes('600/1000')) return 'LV';
    if (combined.includes('66KV') || combined.includes('132KV') || combined.includes('220KV') || combined.includes('130/230')) return 'HV';
    return 'LV';
}

function getFamilyClass(familyId) {
    const f = String(familyId || '').toUpperCase().trim();
    if (f === 'MV' || f.includes('MV')) return 'mv';
    if (f === 'LV' || f.includes('LV')) return 'lv';
    if (f === 'HV' || f.includes('HV')) return 'hv';
    return 'other';
}

// ===== Voltage (LV / MV) linked from Master Production Plan =====
// Source: wo_voltage.js (generated by update_wo_voltage.py) or a Master Plan .xlsx dropped on the page.
const WO_VOLT_STORAGE_KEY = 'metals_wo_voltage_override';
const WO_VOLT_NAMES = {
    LV: 'Low Voltage', MV: 'Medium Voltage', HV: 'High Voltage', CC: 'Control Cables',
    BC: 'Building Wires', OH: 'Overhead', TC: 'Telecom', IC: 'Instrumentation',
    BARE: 'Bare Copper', SOLAR: 'Solar', SOLID: 'Solid'
};
let woVoltageMap = (typeof WO_VOLTAGE_MAP !== 'undefined') ? WO_VOLTAGE_MAP : {};
let woVoltageMeta = (typeof WO_VOLTAGE_META !== 'undefined') ? WO_VOLTAGE_META : null;
try {
    const saved = JSON.parse(localStorage.getItem(WO_VOLT_STORAGE_KEY) || 'null');
    if (saved && saved.map) {
        woVoltageMap = saved.map;
        woVoltageMeta = saved.meta || woVoltageMeta;
    }
} catch (e) { /* ignore corrupt storage */ }

function lookupWoVoltage(wo) {
    const key = String(wo || '').replace(/\s+/g, ' ').trim();
    if (!key) return null;
    if (woVoltageMap[key]) return woVoltageMap[key];
    // e.g. "1010/26/01 B2" -> "1010/26/01"
    const base = key.split(' ')[0];
    return woVoltageMap[base] || null;
}

// Returns { code, cls, fromPlan, title }. Master Plan wins; otherwise falls back to the old family in production data.
function getOrderVoltage(wo, fallbackFam) {
    const planCode = lookupWoVoltage(wo);
    if (planCode) {
        return {
            code: planCode,
            cls: getFamilyClass(planCode),
            fromPlan: true,
            title: `Master Plan: ${WO_VOLT_NAMES[planCode] || planCode}`
        };
    }
    const fb = String(fallbackFam || '').trim() || '-';
    return {
        code: fb,
        cls: getFamilyClass(fb),
        fromPlan: false,
        title: 'Not found in Master Plan (using production data family)'
    };
}

// Build the W.O -> voltage map from a Master Production Plan workbook (same logic as update_wo_voltage.py)
function buildVoltageMapFromWorkbook(wb) {
    const CAT = {
        'low voltage': 'LV', 'medium voltage': 'MV', 'high voltage': 'HV', 'control cables': 'CC',
        'building wires': 'BC', 'bare copper': 'BARE', 'overhead': 'OH', 'solar': 'SOLAR',
        'solid': 'SOLID', 'telecom': 'TC'
    };
    const WO_RE = /^\d{1,5}\/\d{2}\/\d{1,3}/;
    const nh = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const map = {};
    const readSheet = (sheetName, woNames, valNames, convert) => {
        const ws = wb.Sheets[sheetName];
        if (!ws) return 0;
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rows.length) return 0;
        const keys = Object.keys(rows[0]);
        const woKey = keys.find(k => woNames.includes(nh(k)));
        const valKey = keys.find(k => valNames.includes(nh(k)));
        if (!woKey || !valKey) return 0;
        let n = 0;
        rows.forEach(r => {
            const wo = String(r[woKey] || '').replace(/\s+/g, ' ').trim();
            const raw = String(r[valKey] || '').trim();
            if (!WO_RE.test(wo) || !raw || map[wo]) return;
            const code = convert(raw);
            if (code) { map[wo] = code; n++; }
        });
        return n;
    };
    const n1 = readSheet('Orders', ['w.o.', 'w.o', 'wo'], ['cable category'], v => CAT[v.toLowerCase()] || null);
    const n2 = readSheet('Backlog 2', ['wo'], ['family'], v => v.toUpperCase());
    const n3 = readSheet('90 for ADV.', ['work_order'], ['family'], v => v.toUpperCase());
    return { map, n1, n2, n3 };
}

// ===== 4) Date Parsing Helpers =====
function parseExcelDate(val) {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') {
        const utcDays = Math.floor(val - 25569);
        const ms = utcDays * 86400 * 1000;
        return new Date(ms);
    }
    if (typeof val === 'string') {
        const s = val.trim();
        if (s === '-' || s === '  -   -') return null;
        const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (dmy) {
            return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
        }
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

function formatDateToIso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatDateToDisplay(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${day}/${m}/${y}`;
}

// ===== 5) Filter Population & Presets =====
function populateMachineDropdowns() {
    const core = getCoreMachines();
    const bunchers = getBuncherMachines();

    // Main filter machine dropdown
    const selMain = document.getElementById('filterMachine');
    if (selMain) {
        selMain.innerHTML = '';
        const optAll = document.createElement('option');
        optAll.value = 'all';
        optAll.textContent = 'All Displayed Machines';
        selMain.appendChild(optAll);

        const grpCore = document.createElement('optgroup');
        grpCore.label = 'Core Machines (10)';
        core.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            grpCore.appendChild(opt);
        });
        selMain.appendChild(grpCore);

        const grpBn = document.createElement('optgroup');
        grpBn.label = 'Bunchers (BN: 5 Machines)';
        bunchers.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            grpBn.appendChild(opt);
        });
        selMain.appendChild(grpBn);
    }

    // Detail table filter machine dropdown
    const selDetail = document.getElementById('detailFilterMachine');
    if (selDetail) {
        selDetail.innerHTML = '';
        const optAll = document.createElement('option');
        optAll.value = 'all';
        optAll.textContent = 'All Machines';
        selDetail.appendChild(optAll);

        const grpCore = document.createElement('optgroup');
        grpCore.label = 'Core Machines (10)';
        core.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            grpCore.appendChild(opt);
        });
        selDetail.appendChild(grpCore);

        const grpBn = document.createElement('optgroup');
        grpBn.label = 'Bunchers (BN)';
        bunchers.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            grpBn.appendChild(opt);
        });
        selDetail.appendChild(grpBn);
    }
}

function populateFamilyDropdown() {
    const families = [...new Set(rawData.map(r => r.familyid).filter(Boolean))].sort();
    const sel = document.getElementById('detailFilterFamily');
    if (sel) {
        sel.innerHTML = '<option value="all">All Family IDs</option>';
        families.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            sel.appendChild(opt);
        });
    }
}

function setLatestDay() {
    const inputFrom = document.getElementById('filterDateFrom');
    const inputTo = document.getElementById('filterDateTo');
    if (inputFrom) inputFrom.value = maxDateIso;
    if (inputTo) inputTo.value = maxDateIso;

    document.getElementById('btnLatestDay').classList.add('active');
    document.getElementById('btnAllPeriod').classList.remove('active');
    applyFilters();
}

function setAllPeriod() {
    const inputFrom = document.getElementById('filterDateFrom');
    const inputTo = document.getElementById('filterDateTo');
    if (inputFrom) inputFrom.value = minDateIso;
    if (inputTo) inputTo.value = maxDateIso;

    document.getElementById('btnAllPeriod').classList.add('active');
    document.getElementById('btnLatestDay').classList.remove('active');
    applyFilters();
}

function resetFilters() {
    const inputFrom = document.getElementById('filterDateFrom');
    const inputTo = document.getElementById('filterDateTo');
    if (inputFrom) inputFrom.value = maxDateIso;
    if (inputTo) inputTo.value = maxDateIso;

    document.getElementById('filterShift').value = 'all';
    document.getElementById('filterMaterial').value = 'all';
    document.getElementById('filterMachine').value = 'all';

    const btnLatest = document.getElementById('btnLatestDay');
    const btnAll = document.getElementById('btnAllPeriod');
    if (btnLatest) btnLatest.classList.add('active');
    if (btnAll) btnAll.classList.remove('active');

    applyFilters();
}

// Toggle Bunchers (BN) machines
function toggleBunchers() {
    showBunchers = !showBunchers;
    const btn = document.getElementById('btnToggleBunchers');
    const txt = document.getElementById('buncherBtnText');
    if (btn) {
        btn.classList.toggle('active', showBunchers);
        if (txt) {
            txt.textContent = showBunchers ? 'Hide Bunchers (BN)' : 'Show Bunchers (BN: 5 Machines)';
        }
        const icon = btn.querySelector('.toggle-icon');
        if (icon) {
            icon.textContent = showBunchers ? '✅' : '🔘';
        }
    }
    renderMainTable();
    renderKPIs();
    renderDetailTable();
    updateHeaderStats();
}

// ===== 6) Apply Filters & Update Dashboard =====
function applyFilters() {
    const from = document.getElementById('filterDateFrom').value || minDateIso;
    const to = document.getElementById('filterDateTo').value || maxDateIso;
    const shiftFilter = document.getElementById('filterShift').value;
    const materialFilter = document.getElementById('filterMaterial').value;
    const machineFilter = document.getElementById('filterMachine').value;

    filteredData = rawData.filter(r => {
        if (r.dateIso && (r.dateIso < from || r.dateIso > to)) return false;
        if (shiftFilter !== 'all' && r.shift !== shiftFilter) return false;
        if (materialFilter !== 'all' && r.material !== materialFilter) return false;
        if (machineFilter !== 'all' && r.machine !== machineFilter) return false;
        return true;
    });

    const distinctDays = getDistinctDaysCount();
    const fromDisp = from.split('-').reverse().join('/');
    const toDisp = to.split('-').reverse().join('/');

    // 1) Update Top Header Date Badge (Written Date in Arabic)
    const dateLabel = document.getElementById('dateDisplayLabel');
    if (dateLabel) {
        if (from === to) {
            dateLabel.textContent = `📅 ${formatArabicDateFull(from)} (${fromDisp})`;
        } else {
            dateLabel.textContent = `📅 From ${fromDisp} to ${toDisp} (${distinctDays} ${distinctDays === 1 ? 'day' : 'days'})`;
        }
    }

    // 2) Update Filter Bar Written Date Pill
    const activeDatePill = document.getElementById('activeDatePill');
    if (activeDatePill) {
        if (from === to) {
            activeDatePill.textContent = `📅 ${formatArabicDateFull(from)}`;
        } else {
            activeDatePill.textContent = `📅 ${fromDisp} — ${toDisp}`;
        }
    }

    // 3) Update Table Subtitle Date
    const tableSubtitle = document.getElementById('tableSubtitleDate');
    if (tableSubtitle) {
        if (from === to) {
            tableSubtitle.textContent = `Daily Production Report: ${formatDateFull(from)} | Target calculated on 1 day`;
        } else {
            tableSubtitle.textContent = `Period Production Report: From ${fromDisp} to ${toDisp} | Target calculated on ${distinctDays} days`;
        }
    }

    // 4) Update Preset Buttons active states dynamically
    const btnLatest = document.getElementById('btnLatestDay');
    const btnAll = document.getElementById('btnAllPeriod');
    if (btnLatest && btnAll) {
        if (from === maxDateIso && to === maxDateIso) {
            btnLatest.classList.add('active');
            btnAll.classList.remove('active');
        } else if (from === minDateIso && to === maxDateIso) {
            btnAll.classList.add('active');
            btnLatest.classList.remove('active');
        } else {
            btnLatest.classList.remove('active');
            btnAll.classList.remove('active');
        }
    }

    currentPage = 1;
    renderAll();
}

function renderAll() {
    renderKPIs();
    renderMainTable();
    renderDetailTable();
    updateHeaderStats();
    if (typeof updateCable3D === 'function') {
        updateCable3D(filteredData);
    }
}

// ===== 7) Target & Performance Helper =====
function getDistinctDaysCount() {
    const days = new Set(filteredData.filter(r => r.dateIso).map(r => r.dateIso));
    return days.size || 1;
}

// Used only if config.js did not load (missing / blocked / stale cache) so Target/day never disappears
const FALLBACK_MACHINE_DAILY_TARGETS = {
    'RS01': 30000, 'RS02': 26000, 'RS03': 30000, 'RS04': 14000, 'RS05': 26000,
    'RS06': 26000, 'CS01': 30000, 'CS02': 28000, 'DS01': 90000, 'CN': 26000
};

function getMachineDailyTarget(mName, mRows) {
    // 1) Explicit target in config.js (falls back to built-in defaults if config.js is not loaded)
    const targets = (typeof MACHINE_DAILY_TARGETS !== 'undefined') ? MACHINE_DAILY_TARGETS : FALLBACK_MACHINE_DAILY_TARGETS;
    if (targets[mName] !== undefined) {
        return targets[mName];
    }

    // 2) Lookup from RATE_TABLE by size & material if applicable
    if (typeof RATE_TABLE !== 'undefined' && mRows && mRows.length > 0) {
        for (let r of mRows) {
            const cleanSz = cleanSize(r.size, r.cable);
            const found = RATE_TABLE.find(rt => rt.size === cleanSz && rt.material === r.material);
            if (found) return found.target24h;
        }
    }

    return null; // Machine has no target
}

function getPerformanceClass(pct) {
    if (pct === null || pct === undefined) return '';
    if (pct >= 95) return 'perf-excellent';
    if (pct >= 80) return 'perf-good';
    if (pct >= 60) return 'perf-average';
    return 'perf-poor';
}

function getPerformanceLabel(pct) {
    if (pct === null || pct === undefined) return '';
    if (pct >= 95) return 'Optimal';
    if (pct >= 80) return 'Very Good';
    if (pct >= 60) return 'Average';
    return 'Under Target';
}

function getPerfColor(pct) {
    if (pct >= 95) return '#10b981';
    if (pct >= 80) return '#0ea5e9';
    if (pct >= 60) return '#f59e0b';
    return '#ef4444';
}

// ===== 8) Render KPI Cards =====
function renderKPIs() {
    const activeMachines = getActiveVisibleMachines();
    const activeData = filteredData.filter(r => activeMachines.includes(r.machine));
    const distinctDays = getDistinctDaysCount();

    // Actual production length for active machines
    const totalLen = activeData.reduce((s, r) => s + r.length, 0);

    // Sum Target
    let sumTarget = 0;
    activeMachines.forEach(mName => {
        const mRows = activeData.filter(r => r.machine === mName);
        const dailyTarget = getMachineDailyTarget(mName, mRows);
        if (dailyTarget) {
            sumTarget += (dailyTarget * distinctDays);
        }
    });

    const overallPerf = sumTarget > 0 ? ((totalLen / sumTarget) * 100) : 0;

    // Shift sums for active machines
    const s1 = activeData.filter(r => r.shift === '1').reduce((s, r) => s + r.length, 0);
    const s2 = activeData.filter(r => r.shift === '2').reduce((s, r) => s + r.length, 0);
    const s3 = activeData.filter(r => r.shift === '3').reduce((s, r) => s + r.length, 0);

    // Update DOM Numbers
    animateNum('totalLength', Math.round(totalLen));
    animateNum('totalTarget', Math.round(sumTarget));
    animateNum('totalOrdersKPI', activeData.length);

    const perfEl = document.getElementById('deptPerformance');
    if (perfEl) {
        perfEl.textContent = sumTarget > 0 ? `${overallPerf.toFixed(1)}%` : '—';
        perfEl.style.color = overallPerf >= 85 ? 'var(--accent-green)' : (overallPerf >= 60 ? 'var(--accent-cyan)' : 'var(--accent-orange)');
    }

    const perfSub = document.getElementById('deptPerfLabel');
    if (perfSub) {
        perfSub.textContent = sumTarget > 0 ? `Rating: ${getPerformanceLabel(overallPerf)}` : 'No Target Set';
    }

    const targetSub = document.getElementById('totalTargetSub');
    if (targetSub) {
        targetSub.textContent = `Target calculated on ${distinctDays} ${distinctDays === 1 ? 'day' : 'days'}`;
    }

    // Update Shift Pills in Card 5 (Clean Pill Layout, No Text Wrapping)
    const elS1 = document.getElementById('kpiShift1Val');
    const elS2 = document.getElementById('kpiShift2Val');
    const elS3 = document.getElementById('kpiShift3Val');
    if (elS1) elS1.textContent = `${Math.round(s1 / 1000)}k`;
    if (elS2) elS2.textContent = `${Math.round(s2 / 1000)}k`;
    if (elS3) elS3.textContent = `${Math.round(s3 / 1000)}k`;

    const shiftsSub = document.getElementById('kpiShiftsSub');
    if (shiftsSub) {
        const shiftTotals = [
            { name: 'Shift 1', val: s1 },
            { name: 'Shift 2', val: s2 },
            { name: 'Shift 3', val: s3 }
        ].sort((a, b) => b.val - a.val);
        const best = shiftTotals[0];
        const bestPct = totalLen > 0 ? ((best.val / totalLen) * 100).toFixed(1) : 0;
        shiftsSub.textContent = totalLen > 0 ? `${best.name} (${bestPct}%) Highest` : '-';
    }

    // Family breakdown sub in Orders KPI
    const ordersSub = document.getElementById('ordersBreakdownSub');
    if (ordersSub) {
        const fCount = {};
        activeData.forEach(r => {
            if (r.familyid) fCount[r.familyid] = (fCount[r.familyid] || 0) + 1;
        });
        const topF = Object.entries(fCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' | ');
        ordersSub.textContent = topF || 'Department Orders';
    }
}

// ===== Operators per shift (shown right after the Machine column) =====
// Returns the <td> with 3 stacked rows (Shift 1 / 2 / 3). Each row shows the operator(s)
// who logged production on that machine during that shift in the filtered period.
function buildOperatorsCell(mName, shiftRowsList) {
    const rowsHtml = shiftRowsList.map((rows, i) => {
        const shiftNo = i + 1;
        // distinct operators ordered by produced length (main operator first)
        const byOp = {};
        rows.forEach(r => {
            const op = normalizeOperatorName(r.operator);
            if (!op) return;
            byOp[op] = (byOp[op] || 0) + (r.length || 0);
        });
        const ops = Object.keys(byOp).sort((a, b) => byOp[b] - byOp[a]);
        const nameHtml = ops.length
            ? ops.map(op => `<span class="op-name" title="${op}">${shortOperatorName(op)}</span>`).join('<span class="op-sep">/</span>')
            : '<span class="op-empty">—</span>';
        const fullTitle = ops.length ? ops.join(' / ') : 'No operator';
        return `
            <div class="operator-v-row" title="Shift ${shiftNo}: ${fullTitle}">
                <span class="shift-badge shift-s${shiftNo} op-shift-badge">S${shiftNo}</span>
                <div class="op-names">${nameHtml}</div>
            </div>`;
    }).join('');
    return `
        <td style="text-align: center; vertical-align: middle;">
            <div class="operator-v-stack">${rowsHtml}</div>
        </td>`;
}

// ===== 9) Render Main Productivity Table =====
function renderMainTable() {
    const tbody = document.getElementById('machineShiftBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const distinctDays = getDistinctDaysCount();
    const machineList = getActiveVisibleMachines();

    let sumS1 = 0;
    let sumS2 = 0;
    let sumS3 = 0;
    let sumTotalLen = 0;
    const allWOsSet = new Set();
    const allSizesSet = new Set();
    const allVoltByWO = {};

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

        // 1. Machine
        const machineCell = `
            <td style="text-align: center; vertical-align: middle;">
                <span class="machine-name">${mName}</span>
            </td>`;

        // 1b. Operators - one name per shift, stacked under each other (S1 / S2 / S3)
        const operatorsCell = buildOperatorsCell(mName, [mRowsS1, mRowsS2, mRowsS3]);

        // Group by distinct Work Order on this machine
        const machineOrders = [];
        const seenWOs = new Set();

        mRows.forEach(r => {
            const wo = String(r.workorder || '').trim();
            if (!wo) return;
            if (!seenWOs.has(wo)) {
                seenWOs.add(wo);
                const woRows = mRows.filter(row => String(row.workorder || '').trim() === wo);
                const sizes = [...new Set(woRows.map(row => cleanSize(row.size, row.cable)).filter(Boolean))];
                const sizeStr = sizes.length > 0 ? sizes.join(', ') : '-';
                const isCu = woRows.some(row => row.material === 'CU');
                const mat = isCu ? 'CU' : 'AL';
                const fams = [...new Set(woRows.map(row => row.familyid).filter(Boolean))];
                const woMeters = woRows.reduce((sum, row) => sum + (row.length || 0), 0);
                const volt = getOrderVoltage(wo, fams[0]);

                const rawSizesList = [...new Set(woRows.map(row => String(row.rawSize || row.size || '')).filter(Boolean))];
                const rawSizesStr = rawSizesList.join(', ');

                machineOrders.push({
                    workorder: wo,
                    volt: volt,
                    size: sizeStr,
                    rawSize: rawSizesStr,
                    sizes: sizes,
                    material: mat,
                    isCu: isCu,
                    families: fams,
                    meters: woMeters
                });

                allWOsSet.add(wo);
                allVoltByWO[wo] = volt.code;
                sizes.forEach(sz => allSizesSet.add(sz));
            }
        });

        // 2. W.O (Work Orders) - listed below one another
        // 3. Cable Size - corresponding size placed directly in front of each order
        // 4. Conductor - corresponding material placed directly in front of each order
        // 10. Cable Type - corresponding family placed directly in front of each order
        let woCellContent = '';
        let qtCellContent = '';
        let voltCellContent = '';
        let sizeCellContent = '';
        let conductorCellContent = '';
        let cableTypeCellContent = '';

        if (machineOrders.length > 0) {
            const woRowsHtml = machineOrders.map((ord, idx) => `
                <div class="order-v-row" data-machine="${mName}" data-idx="${idx}">
                    <span class="wo-pill" title="Work Order: ${ord.workorder}">
                        ${ord.workorder}
                    </span>
                </div>`).join('');

            // qt by order: the quantity produced for each order (same figure that used to sit beside the W.O)
            const qtRowsHtml = machineOrders.map((ord, idx) => `
                <div class="order-v-row" data-machine="${mName}" data-idx="${idx}">
                    <span class="wo-len-km" title="Work Order: ${ord.workorder} | ${ord.meters.toLocaleString()} m">${Math.round(ord.meters).toLocaleString('en-US')} m</span>
                </div>`).join('');

            const sizeRowsHtml = machineOrders.map((ord, idx) => {
                const recordedTip = (ord.rawSize && ord.rawSize !== ord.size) ? ` | Recorded: ${ord.rawSize}` : '';
                return `
                <div class="size-v-row" data-machine="${mName}" data-idx="${idx}">
                    <span class="size-num-tag ${ord.isCu ? 'cu' : 'al'}" title="Work Order: ${ord.workorder} | Size: ${ord.size} mm² (${ord.material})${recordedTip}">
                        ${ord.size} <small class="size-unit-sub">mm²</small>
                    </span>
                </div>
            `;}).join('');

            const condRowsHtml = machineOrders.map((ord, idx) => `
                <div class="conductor-v-row" data-machine="${mName}" data-idx="${idx}">
                    <span class="material-tag ${ord.isCu ? 'material-copper' : 'material-aluminum'}" title="Conductor: ${ord.material}">
                        ${ord.material}
                    </span>
                </div>
            `).join('');

            const mFamilies = [...new Set(mRows.map(r => r.familyid).filter(Boolean))];
            const famRowsHtml = machineOrders.map((ord, idx) => {
                const fam = ord.families[0] || mFamilies[0] || 'LV';
                return `
                    <div class="family-v-row" data-machine="${mName}" data-idx="${idx}">
                        <span class="family-badge ${getFamilyClass(fam)}">${fam}</span>
                    </div>`;
            }).join('');

            // Voltage (LV / MV) from Master Plan - sits between qt by order and Cable Size
            const voltRowsHtml = machineOrders.map((ord, idx) => `
                <div class="family-v-row" data-machine="${mName}" data-idx="${idx}">
                    <span class="family-badge ${ord.volt.cls}${ord.volt.fromPlan ? '' : ' volt-unverified'}" title="Work Order: ${ord.workorder} | ${ord.volt.title}">${ord.volt.code}</span>
                </div>`).join('');

            woCellContent = `<div class="order-v-stack">${woRowsHtml}</div>`;
            qtCellContent = `<div class="order-v-stack">${qtRowsHtml}</div>`;
            voltCellContent = `<div class="family-v-stack">${voltRowsHtml}</div>`;
            sizeCellContent = `<div class="size-v-stack">${sizeRowsHtml}</div>`;
            conductorCellContent = `<div class="conductor-v-stack">${condRowsHtml}</div>`;
            cableTypeCellContent = `<div class="family-v-stack">${famRowsHtml}</div>`;
        } else {
            woCellContent = `<span style="color:#94a3b8; font-weight:700;">—</span>`;
            qtCellContent = `<span style="color:#94a3b8; font-weight:700;">—</span>`;
            voltCellContent = `<span style="color:#94a3b8; font-weight:700;">—</span>`;
            sizeCellContent = `<span style="color:#94a3b8; font-weight:700;">—</span>`;
            conductorCellContent = `<span style="color:#94a3b8; font-weight:700;">—</span>`;
            cableTypeCellContent = `<span style="color:#94a3b8; font-weight:700;">—</span>`;
        }

        const woCell = `
            <td style="text-align: center; vertical-align: middle;">
                ${woCellContent}
            </td>`;

        const voltCell = `
            <td style="text-align: center; vertical-align: middle;">
                ${voltCellContent}
            </td>`;

        const sizeCell = `
            <td style="text-align: center; vertical-align: middle;">
                ${sizeCellContent}
            </td>`;

        const conductorCell = `
            <td style="text-align: center; vertical-align: middle;">
                ${conductorCellContent}
            </td>`;

        // qt by order
        const qtCell = `
            <td style="text-align: center; vertical-align: middle;">
                ${qtCellContent}
            </td>`;

        // Shifts 1, 2, 3 in meters
        function formatShiftM(meters) {
            if (meters <= 0) return '<span style="color:#cbd5e1">-</span>';
            return `
                <div class="shift-cell-wrapper" title="${(meters / 1000).toFixed(2)} km">
                    <span class="num" style="font-weight:700;">${Math.round(meters).toLocaleString('en-US')}</span>
                    <small style="font-size:0.7rem; color:#64748b;">m</small>
                </div>`;
        }
        const shift1Cell = `<td style="text-align: center; vertical-align: middle;">${formatShiftM(s1)}</td>`;
        const shift2Cell = `<td style="text-align: center; vertical-align: middle;">${formatShiftM(s2)}</td>`;
        const shift3Cell = `<td style="text-align: center; vertical-align: middle;">${formatShiftM(s3)}</td>`;

        // 9. Production km/day
        const totalKm = (totalLen / 1000).toFixed(2);
        const prodKmCell = `
            <td style="text-align: center; vertical-align: middle;" title="${totalLen.toLocaleString()} m">
                <span class="num prod-km-value">${totalKm}</span>
                <span class="prod-km-unit">km/day</span>
            </td>`;

        const tr = document.createElement('tr');
        tr.className = 'highlight-row';
        tr.innerHTML = machineCell + operatorsCell + woCell + qtCell + voltCell + sizeCell + conductorCell + shift1Cell + shift2Cell + shift3Cell + prodKmCell;
        tbody.appendChild(tr);
    });

    // TOTAL SUMMARY ROW
    const totalTr = document.createElement('tr');
    totalTr.className = 'total-summary-row';
    totalTr.innerHTML = `
        <td style="text-align: center; color: var(--accent-blue); font-size: 1.02rem; font-weight: 900;">
            Total
        </td>
        <td style="text-align: center;"></td>
        <td style="text-align: center; font-size: 0.85rem; color: #1e3a8a; font-weight: 800;">
            ${allWOsSet.size} Orders
        </td>
        <td style="text-align: center; font-size: 0.85rem; color: #1e3a8a; font-weight: 800;">
            ${(sumTotalLen / 1000).toFixed(2)} km
        </td>
        <td style="text-align: center; font-size: 0.8rem; color: #1e3a8a; font-weight: 800; white-space: nowrap;">
            ${(() => {
                const vals = Object.values(allVoltByWO);
                const lv = vals.filter(v => v === 'LV').length;
                const mv = vals.filter(v => v === 'MV').length;
                return `LV ${lv} · MV ${mv}`;
            })()}
        </td>
        <td style="text-align: center; font-size: 0.85rem; color: #1e3a8a; font-weight: 800;">
            ${allSizesSet.size} Sizes
        </td>
        <td style="text-align: center;">
            <span class="material-tag material-copper">CU</span>
            <span class="material-tag material-aluminum">AL</span>
        </td>
        <td style="text-align: center;">
            <span class="num font-bold" style="color:#1e3a8a;">${Math.round(sumS1).toLocaleString('en-US')} m</span>
        </td>
        <td style="text-align: center;">
            <span class="num font-bold" style="color:#1e3a8a;">${Math.round(sumS2).toLocaleString('en-US')} m</span>
        </td>
        <td style="text-align: center;">
            <span class="num font-bold" style="color:#1e3a8a;">${Math.round(sumS3).toLocaleString('en-US')} m</span>
        </td>
        <td style="text-align: center;">
            <span class="num" style="font-size: 1.15rem; color: #1e3a8a; font-weight: 900;">
                ${(sumTotalLen / 1000).toFixed(2)} km/day
            </span>
        </td>
    `;
    tbody.appendChild(totalTr);

    initTableSyncHover();
}

// ===== Sync Hover Delegate for Machine Orders & Sizes =====
function initTableSyncHover() {
    const table = document.getElementById('machineShiftTable');
    if (!table || table.dataset.syncHoverInit) return;
    table.dataset.syncHoverInit = 'true';

    table.addEventListener('mouseover', (e) => {
        const item = e.target.closest('[data-machine][data-idx]');
        if (!item) return;
        const mach = item.dataset.machine;
        const idx = item.dataset.idx;
        const matches = table.querySelectorAll(`[data-machine="${mach}"][data-idx="${idx}"]`);
        matches.forEach(el => el.classList.add('is-synced-hover'));
    });

    table.addEventListener('mouseout', (e) => {
        const item = e.target.closest('[data-machine][data-idx]');
        if (!item) return;
        const mach = item.dataset.machine;
        const idx = item.dataset.idx;
        const matches = table.querySelectorAll(`[data-machine="${mach}"][data-idx="${idx}"]`);
        matches.forEach(el => el.classList.remove('is-synced-hover'));
    });
}

// ===== 10) Render Orders Details Table (Section 2) =====
function renderDetailTable() {
    const tbody = document.getElementById('detailTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const familyFilter = document.getElementById('detailFilterFamily').value;
    const machineFilter = document.getElementById('detailFilterMachine').value;
    const shiftFilter = document.getElementById('detailFilterShift').value;
    const materialFilter = document.getElementById('detailFilterMaterial').value;
    const searchVal = (document.getElementById('tableSearch').value || '').trim().toLowerCase();
    const pageSizeVal = document.getElementById('detailPageSize').value;

    const activeMachines = getActiveVisibleMachines();

    currentDetailData = filteredData.filter(r => {
        // Only show department machines (or unassigned machine records)
        if (r.machine && !activeMachines.includes(r.machine)) return false;
        if (familyFilter !== 'all' && r.familyid !== familyFilter) return false;
        if (machineFilter !== 'all' && r.machine !== machineFilter) return false;
        if (shiftFilter !== 'all' && r.shift !== shiftFilter) return false;
        if (materialFilter !== 'all' && r.material !== materialFilter) return false;

        if (searchVal) {
            const matchStr = `${r.workorder} ${r.joborder} ${r.label_no} ${r.size} ${r.material} ${r.familyid} ${r.drumno} ${r.customer} ${r.machine} ${r.operator}`.toLowerCase();
            if (!matchStr.includes(searchVal)) return false;
        }

        return true;
    });

    const countBadge = document.getElementById('detailRecordCount');
    if (countBadge) {
        countBadge.textContent = `${currentDetailData.length.toLocaleString()} Records`;
    }

    const pageSize = pageSizeVal === 'all' ? currentDetailData.length : parseInt(pageSizeVal, 10);
    const totalPages = pageSizeVal === 'all' ? 1 : Math.ceil(currentDetailData.length / pageSize) || 1;

    if (currentPage > totalPages) currentPage = 1;

    const startIdx = (currentPage - 1) * pageSize;
    const pageRows = currentDetailData.slice(startIdx, startIdx + pageSize);

    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 24px; color: #94a3b8;">لا توجد أوامر مطابقة لخيارات الفلترة</td></tr>`;
        renderPagination(1);
        return;
    }

    pageRows.forEach(r => {
        const isCu = r.material === 'CU';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-family: var(--font-en); font-weight: 700; color: #1e293b;">${r.workorder || '-'}</td>
            <td style="font-family: var(--font-en); font-size: 0.8rem; color: #475569; white-space: nowrap;">${r.joborder || '-'}</td>
            <td style="font-family: var(--font-en); font-size: 0.8rem; color: #475569; white-space: nowrap;">${r.label_no || '-'}</td>
            <td><span class="size-num-tag ${isCu ? 'cu' : 'al'}">${cleanSize(r.size, r.cable)}</span></td>
            <td><span class="material-tag ${isCu ? 'material-copper' : 'material-aluminum'}">${r.material}</span></td>
            <td><span class="family-badge ${getFamilyClass(r.familyid)}">${r.familyid || '-'}</span></td>
            <td style="font-family: var(--font-en);">${r.drumno || '-'}</td>
            <td style="font-family: var(--font-en); font-weight: 700; text-align: center;">${r.length.toLocaleString()}</td>
            <td style="font-family: var(--font-en); white-space: nowrap;">${r.dateDisplay || '-'}</td>
            <td style="font-size: 0.82rem; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.customer}">${r.customer || '-'}</td>
            <td style="text-align: center;"><span class="shift-badge shift-s${r.shift}">${r.shift ? 'S' + r.shift : '-'}</span></td>
            <td style="font-family: var(--font-en); font-weight: 800; color: var(--accent-blue);">${r.machine || '-'}</td>
            <td style="font-size: 0.85rem; font-weight: 700; white-space: nowrap; direction: rtl; text-align: right;" title="${r.operator || ''}">${r.operator ? shortOperatorName(r.operator) : '—'}</td>
        `;
        tbody.appendChild(tr);
    });

    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const container = document.getElementById('paginationControls') || document.getElementById('pagination');
    if (!container) return;
    container.innerHTML = '';

    if (totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.textContent = 'Previous';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { currentPage--; renderDetailTable(); };
    container.appendChild(prevBtn);

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        if (i === currentPage) btn.className = 'active';
        btn.onclick = () => { currentPage = i; renderDetailTable(); };
        container.appendChild(btn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => { currentPage++; renderDetailTable(); };
    container.appendChild(nextBtn);
}

// ===== 11) Helpers & Header Stats =====
function updateHeaderStats() {
    const activeMachines = getActiveVisibleMachines();
    const activeData = filteredData.filter(r => activeMachines.includes(r.machine));
    const elRec = document.getElementById('totalRecords');
    if (elRec) elRec.textContent = activeData.length.toLocaleString();

    const elMach = document.getElementById('totalMachinesCount');
    if (elMach) {
        elMach.textContent = activeMachines.length;
    }
    const elMachLabel = document.getElementById('machinesCountLabel');
    if (elMachLabel) {
        elMachLabel.textContent = showBunchers ? 'Machines (Core + Bunchers)' : 'Core Machines';
    }
}

function animateNum(elementId, value) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = value.toLocaleString();
}

// ===== 12) Export to Excel & PDF =====
function exportToExcel() {
    const exportRows = currentDetailData.map(r => ({
        'Work Order': r.workorder,
        'Job Order': r.joborder,
        'Label No': r.label_no,
        'Size': r.size,
        'Material': r.material,
        'Family ID': r.familyid,
        'Drum No': r.drumno,
        'Length (m)': r.length,
        'Net Weight (kg)': r.weight,
        'Date': r.dateDisplay,
        'Customer': r.customer,
        'Shift': r.shift,
        'Machine': r.machine,
        'Operator': r.operator
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detailed Orders');
    XLSX.writeFile(wb, `Metals_Production_${document.getElementById('filterDateFrom').value}_to_${document.getElementById('filterDateTo').value}.xlsx`);
}

function exportToPDF() {
    const element = document.getElementById('reportContainer');
    const opt = {
        margin: [8, 10, 8, 10],
        filename: `Metals_Report_${document.getElementById('filterDateFrom').value}_to_${document.getElementById('filterDateTo').value}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };
    html2pdf().set(opt).from(element).save();
}

// ===== 13) Force Cache Busting & Reload =====
function forceHardRefresh() {
    if (window.location.protocol === 'file:') {
        window.location.reload();
        return;
    }
    const v = Date.now();
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('v', v);
    window.location.href = window.location.pathname + '?' + urlParams.toString();
}

// ===== 14) Daily Data Drag & Drop / File Upload Feature =====
let toastTimer = null;

function initDragAndDrop() {
    const overlay = document.getElementById('dragDropOverlay');
    if (!overlay) return;

    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        overlay.classList.remove('hidden');
    });

    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            overlay.classList.add('hidden');
        }
    });

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.classList.add('hidden');

        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            processDailyFile(file);
        }
    });
}

function triggerDailyUpload() {
    const fileInput = document.getElementById('dailyFileInput');
    if (fileInput) fileInput.click();
}

function handleDailyFileSelect(event) {
    if (!event || !event.target || !event.target.files) return;
    const file = event.target.files[0];
    if (file) {
        processDailyFile(file);
    }
    event.target.value = '';
}

// Minimal CSV reader (header row -> objects). Used only when papaparse.min.js is missing.
function parseCsvBuiltin(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
            } else { field += c; }
        } else if (c === '"') { inQ = true; }
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.some(v => v !== '')) rows.push(row);
            row = [];
        } else { field += c; }
    }
    row.push(field);
    if (row.some(v => v !== '')) rows.push(row);
    if (rows.length < 2) return [];
    const header = rows[0].map(h => h.trim());
    return rows.slice(1).map(r => {
        const o = {};
        header.forEach((h, idx) => { o[h] = (r[idx] !== undefined ? r[idx] : '').trim(); });
        return o;
    });
}

function processDailyFile(file) {
    if (!file) return;
    const name = file.name || '';
    const ext = name.split('.').pop().toLowerCase();

    showToast('Reading File', `Analyzing ${name}...`, '⏳');

    if (ext === 'csv') {
        if (typeof Papa === 'undefined') {
            // papaparse.min.js did not load -> use the built-in CSV reader instead
            const csvReader = new FileReader();
            csvReader.onload = function (e) {
                try {
                    const rows = parseCsvBuiltin(String(e.target.result || ''));
                    if (rows.length > 0) {
                        handleParsedRows(rows, name);
                    } else {
                        showToast('Empty File', 'No rows found in CSV file', '⚠️');
                    }
                } catch (err) {
                    showToast('Read Error', err.message, '❌');
                }
            };
            csvReader.onerror = () => showToast('Read Error', 'Could not read the CSV file', '❌');
            csvReader.readAsText(file, 'utf-8');
            return;
        }
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                if (results.data && results.data.length > 0) {
                    handleParsedRows(results.data, name);
                } else {
                    showToast('Empty File', 'No rows found in CSV file', '⚠️');
                }
            },
            error: function (err) {
                showToast('Read Error', err.message, '❌');
            }
        });
    } else if (ext === 'xlsx' || ext === 'xls') {
        if (typeof XLSX === 'undefined') {
            showToast('Error', 'SheetJS (XLSX) library is unavailable to parse Excel', '❌');
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = new Uint8Array(e.target.result);

                // Master Production Plan workbook? (has "Orders" + "Backlog 2" sheets) -> update W.O voltage map only
                const peek = XLSX.read(data, { type: 'array', bookSheets: true });
                if (peek.SheetNames.includes('Orders') && peek.SheetNames.includes('Backlog 2')) {
                    const full = XLSX.read(data, { type: 'array', sheets: ['Orders', 'Backlog 2', '90 for ADV.'] });
                    const res = buildVoltageMapFromWorkbook(full);
                    const total = Object.keys(res.map).length;
                    if (total === 0) {
                        showToast('Master Plan', 'No work orders / categories found in this workbook', '⚠️');
                        return;
                    }
                    woVoltageMap = res.map;
                    woVoltageMeta = { source: name, generated: new Date().toISOString().slice(0, 16).replace('T', ' '), total: total };
                    try {
                        localStorage.setItem(WO_VOLT_STORAGE_KEY, JSON.stringify({ map: woVoltageMap, meta: woVoltageMeta }));
                    } catch (err) { console.warn('Could not save voltage map:', err); }
                    renderMainTable();
                    showToast('Master Plan linked', `${total} work orders (LV/MV) loaded from ${name}`, '✅');
                    return;
                }

                const wb = XLSX.read(data, { type: 'array' });
                const firstSheetName = wb.SheetNames[0];
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheetName], { defval: '' });
                if (rows && rows.length > 0) {
                    handleParsedRows(rows, name);
                } else {
                    showToast('Empty File', 'No data found in first sheet', '⚠️');
                }
            } catch (err) {
                showToast('Excel Error', err.message, '❌');
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        showToast('Unsupported Format', 'Please upload a CSV or Excel (.xlsx, .xls) file', '⚠️');
    }
}

function handleParsedRows(rows, fileName) {
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
    const colAl = findCol(['AL', 'AluminumTon', 'al_ton']) || 'AL';
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

        let matText = String(r[colMat] || '').trim().toUpperCase();
        let cuTon = parseFloat(r[colCu]) || 0;
        let alTon = parseFloat(r[colAl]) || 0;
        let material = 'AL';
        if (matText === 'AL' || matText.includes('AL') || matText.includes('الومنيوم') || matText.includes('ألومنيوم')) {
            material = 'AL';
        } else if (matText === 'CU' || matText.includes('CU') || matText.includes('COPPER') || matText.includes('نحاس')) {
            material = 'CU';
        } else if (cuTon > 0 && cuTon > alTon) {
            material = 'CU';
        } else {
            material = 'AL';
        }

        let cable = size.includes('+') ? `0.6/1 KV,${material},${size}` : `0.6/1 KV,${material},1*${size}`;
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
            rawSize: rawSize,
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

function downloadUpdatedIndexHtml() {
    showToast('Processing', 'Generating updated index.html with new production data...', '⏳');

    const exportable = rawData.map(r => ({
        id: r.id,
        workorder: r.workorder,
        joborder: r.joborder,
        label_no: r.label_no,
        cable: r.cable,
        size: r.size,
        material: r.material,
        familyid: r.familyid,
        drumno: r.drumno,
        length: r.length,
        weight: r.weight,
        customer: r.customer,
        shift: r.shift,
        machine: r.machine,
        dateIso: r.dateIso,
        dateDisplay: r.dateDisplay,
        operator: r.operator || ''
    }));

    const jsonStr = JSON.stringify(exportable);
    const scriptBlock = `<script id="embeddedMetalsData">\nvar METALS_DATA = ${jsonStr};\nif (typeof window !== "undefined") { window.METALS_DATA = METALS_DATA; }\nif (typeof module !== "undefined" && module.exports) { module.exports = METALS_DATA; }\n</script>`;

    let htmlContent = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    if (htmlContent.includes('<script id="embeddedMetalsData">')) {
        htmlContent = htmlContent.replace(/<script id="embeddedMetalsData">[\s\S]*?<\/script>/, scriptBlock);
    } else {
        htmlContent = htmlContent.replace('<script src="config.js', scriptBlock + '\n    <script src="config.js');
    }

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('تم التنزيل بنجاح', 'تم تنزيل ملف index.html المحدث بكامل البيانات الجديدة! يمكنك الآن رفعه مباشرة على موقع GitHub.', '🎉');
}

function downloadUpdatedMetalsJson() {
    const exportable = rawData.map(r => ({
        id: r.id,
        workorder: r.workorder,
        joborder: r.joborder,
        label_no: r.label_no,
        cable: r.cable,
        size: r.size,
        material: r.material,
        familyid: r.familyid,
        drumno: r.drumno,
        length: r.length,
        weight: r.weight,
        customer: r.customer,
        shift: r.shift,
        machine: r.machine,
        dateIso: r.dateIso,
        dateDisplay: r.dateDisplay,
        operator: r.operator || ''
    }));

    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'metals_data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('تم التنزيل', 'تم تنزيل ملف metals_data.json بنجاح، يمكنك استبداله ورفعه على GitHub إذا أردت حفظه دائمًا.', '💾');
}

function clearLocalImportedData() {
    localStorage.removeItem('metals_dashboard_local_imports');
    showToast('Reset Done', 'Local imports cleared. Reloading dashboard...', '🔄');
    setTimeout(() => {
        loadData();
    }, 600);
}

function showToast(title, message, iconType = '✅', actionsHtml = '') {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;

    const iconEl = document.getElementById('toastIcon');
    const titleEl = document.getElementById('toastTitle');
    const msgEl = document.getElementById('toastMessage');
    const actionsEl = document.getElementById('toastActions');

    if (iconEl) iconEl.textContent = iconType;
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (actionsEl) actionsEl.innerHTML = actionsHtml;

    toast.classList.remove('hidden');

    if (toastTimer) clearTimeout(toastTimer);
    if (!actionsHtml) {
        toastTimer = setTimeout(() => {
            hideToast();
        }, 5000);
    }
}

function hideToast() {
    const toast = document.getElementById('toastNotification');
    if (toast) toast.classList.add('hidden');
}
