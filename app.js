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
            if (wo && !wip002Lookup[wo]) {
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
function cleanSize(rawSize, cable) {
    let s = String(rawSize || '').trim();
    if (!s || s === '-' || s === '  -   -') {
        s = extractSizeFromCable(cable);
    }
    if (!s || s === '-' || s === '  -   -') return '-';

    s = s.replace(/\s*MM2?$/i, '').trim();

    // If composite (+), take the main portion before +
    // e.g. 240+120 -> 240, 70+35 -> 70, 120+35 -> 120, 3*240+120 -> 3*240
    if (s.includes('+')) {
        s = s.split('+')[0].trim();
    }

    // If ratio (/), take the main portion before /
    // e.g. 150/25 -> 150, 35/6 -> 35
    if (s.includes('/')) {
        s = s.split('/')[0].trim();
    }

    // Normalize multipliers
    s = s.replace(/[\*X]/g, 'x');
    s = s.replace(/\s*x\s*/g, 'x');

    // Extract the actual stranded conductor size (the last number in expressions like 3x240, 4x4x70, 1x240)
    const stdSizes = new Set(['0.5', '0.75', '1', '1.5', '2.5', '4', '6', '10', '16', '25', '35', '50', '70', '75', '78', '95', '120', '150', '185', '240', '300', '400', '500', '630', '800', '1000', '1200', '1600', '2000']);
    const parts = s.split('x').map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) {
        if (stdSizes.has(parts[parts.length - 1])) return parts[parts.length - 1];
        for (const p of parts) {
            if (stdSizes.has(p)) return p;
        }
        return parts[parts.length - 1];
    }

    return s || extractSizeFromCable(cable);
}

function extractSizeFromCable(cable) {
    if (!cable) return '-';
    const m = cable.match(/\b(\d+(?:\.\d+)?\*(?:\d+(?:\.\d+)?\*)*\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)?(?:\/\d+(?:\.\d+)?)?)\b/);
    if (m) {
        let s = m[1];
        if (s.includes('+')) s = s.split('+')[0].trim();
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

function getMachineDailyTarget(mName, mRows) {
    // 1) Explicit target in config.js
    if (typeof MACHINE_DAILY_TARGETS !== 'undefined' && MACHINE_DAILY_TARGETS[mName] !== undefined) {
        return MACHINE_DAILY_TARGETS[mName];
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
        tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 24px; color: #94a3b8;">لا توجد أوامر مطابقة لخيارات الفلترة</td></tr>`;
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

function processDailyFile(file) {
    if (!file) return;
    const name = file.name || '';
    const ext = name.split('.').pop().toLowerCase();

    showToast('Reading File', `Analyzing ${name}...`, '⏳');

    if (ext === 'csv') {
        if (typeof Papa === 'undefined') {
            showToast('Error', 'PapaParse library is unavailable to parse CSV', '❌');
            return;
        }
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                if (results.data && results.data.length > 0) {
                    handleParsedRows(results.data, name);
                } else {
                    showToast('Empty File', 'No rows found in CSV file', '⚠️');
                }
            },
            error: function(err) {
                showToast('Read Error', err.message, '❌');
            }
        });
    } else if (ext === 'xlsx' || ext === 'xls') {
        if (typeof XLSX === 'undefined') {
            showToast('Error', 'SheetJS (XLSX) library is unavailable to parse Excel', '❌');
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
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
        dateDisplay: r.dateDisplay
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
        dateDisplay: r.dateDisplay
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
