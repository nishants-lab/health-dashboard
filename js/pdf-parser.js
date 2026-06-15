/**
 * Client-side PDF lab report parser
 * Uses PDF.js to extract text, then regex patterns to identify biomarker values.
 * Supports: Tata 1mg/MGB, Orange Health, Thyrocare, Healthians, Sparsh Hospital
 */

const LabParser = (function() {
    'use strict';

    const MARKERS = [
        { key: 'tsh', names: ['TSH','Thyroid Stimulating Hormone','TSH.*Ultra'], unit: 'uIU/mL' },
        { key: 'ft3', names: ['Free T3','FT3','Free Triiodothyronine'], unit: 'pg/mL' },
        { key: 'ft4', names: ['Free T4','FT4','Free Thyroxine'], unit: 'ng/dL' },
        { key: 'totalT3', names: ['Triiodothyronine \\(T3\\), Total','TOTAL TRIIODOTHYRONINE'], unit: 'ng/dL' },
        { key: 'totalT4', names: ['Thyroxine \\(T4\\), Total','TOTAL THYROXINE'], unit: 'ug/dL' },
        { key: 'antiTPO', names: ['Anti.?TPO','Anti-Thyroid Peroxidase'], unit: 'IU/mL' },
        { key: 'totalCholesterol', names: ['Cholesterol.*Total','Total Cholesterol','CHOLESTEROL, TOTAL','CHOLESTEROL-TOTAL'], unit: 'mg/dL' },
        { key: 'hdl', names: ['HDL Cholesterol','HDL CHOLESTEROL','Cholesterol.*HDL','High.?Density Lipoprotein'], unit: 'mg/dL' },
        { key: 'ldl', names: ['LDL Cholesterol','LDL CHOLESTEROL','Low.?Density Lipoprotein \\(LDL\\)'], unit: 'mg/dL' },
        { key: 'triglycerides', names: ['Triglycerides','TRIGLYCERIDES'], unit: 'mg/dL' },
        { key: 'vldl', names: ['VLDL','Very Low.?Density'], unit: 'mg/dL' },
        { key: 'cholHdlRatio', names: ['Cholesterol.*HDL.*Ratio','CHO/HDL RATIO','TC/ HDL','Total CHOL.*HDL'], unit: 'Ratio' },
        { key: 'vitaminD', names: ['Vitamin D.*25','25-OH VITAMIN D','25-Hydroxy'], unit: 'ng/mL' },
        { key: 'vitaminB12', names: ['Vitamin B.?12','VITAMIN B-12','Cyanocobalamin'], unit: 'pg/mL' },
        { key: 'hba1c', names: ['HbA1c','HBA1C','Glycated Hemoglobin','Glycated Haemoglobin'], unit: '%' },
        { key: 'fastingGlucose', names: ['Glucose.*Fasting','Fasting.*Glucose','FASTING BLOOD SUGAR'], unit: 'mg/dL' },
        { key: 'hemoglobin', names: ['Hemoglobin \\(Hb\\)','Haemoglobin \\(HB\\)','HEMOGLOBIN'], unit: 'g/dL', exclude: ['Glycated','Mean Corp','MCHC','MCH','HbA1c'] },
        { key: 'platelets', names: ['Platelet Count','PLATELET COUNT'], unit: '10^3/uL' },
        { key: 'wbc', names: ['Total Leucocyte Count','Total White Blood Cell','Total Count'], unit: '10^3/uL' },
        { key: 'esr', names: ['Erythrocyte Sedimentation Rate','ESR \\(WESTERGREN\\)'], unit: 'mm/hr' },
        { key: 'ast', names: ['Aspartate Aminotransferase \\(AST\\)','SGOT/AST','SGOT\\.'], unit: 'U/L', exclude: ['AST/ALT','SGOT/SGPT','Ratio'] },
        { key: 'alt', names: ['Alanine Transaminase \\(ALT\\)','SGPT/ ALT','SGPT','Alanine Aminotransferase'], unit: 'U/L', exclude: ['AST/ALT','SGOT/SGPT','Ratio'] },
        { key: 'bilirubin', names: ['Bilirubin, Total','TOTAL BILIRUBIN','Bilirubin.*Total'], unit: 'mg/dL', exclude: ['Direct','Indirect'] },
        { key: 'albumin', names: ['Albumin','SERUM ALBUMIN','ALBUMIN - SERUM'], unit: 'g/dL', exclude: ['Globulin','Microalbumin','Ratio','A/G'] },
        { key: 'creatinine', names: ['Creatinine','SERUM CREATININE'], unit: 'mg/dL', exclude: ['BUN/','Urea/','Ratio','eGFR'] },
        { key: 'uricAcid', names: ['Uric Acid','URIC ACID'], unit: 'mg/dL' },
        { key: 'egfr', names: ['eGFR','Estimated Glomerular Filtration'], unit: 'mL/min' },
        { key: 'urea', names: ['\\bUrea\\b','UREA\\b'], unit: 'mg/dL', exclude: ['BUN','Nitrogen','Ratio','UREA /'] },
        { key: 'sodium', names: ['Sodium','SODIUM'], unit: 'mmol/L' },
        { key: 'potassium', names: ['Potassium','POTASSIUM'], unit: 'mmol/L' },
        { key: 'calcium', names: ['\\bCalcium\\b','CALCIUM'], unit: 'mg/dL', exclude: ['Oxalate','Phosphate'] },
        { key: 'testosterone', names: ['Testosterone.*total','TESTOSTERONE TOTAL'], unit: 'ng/dL' },
    ];

    async function extractText(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }
        return fullText;
    }

    function detectDate(text) {
        const patterns = [
            /(?:Collection|Collected|Sample Collected)[^]*?(\d{1,2})[\/\-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\/\-](\d{2,4})/i,
            /(?:Collection|Collected|Sample Collected)[^]*?(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i,
            /(?:collection date|collected)[^]*?(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i,
            /(\d{1,2})[\/\-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\/\-](\d{2,4})/i,
            /(\d{2})\/(\d{2})\/(\d{4})/,
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const d = parseDate(match);
                if (d) return d;
            }
        }
        return null;
    }

    function parseDate(match) {
        const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
        let day = parseInt(match[1]);
        let month, year;
        if (isNaN(parseInt(match[2]))) {
            month = months[match[2].toLowerCase().substring(0,3)];
            year = parseInt(match[3]);
        } else {
            month = parseInt(match[2]) - 1;
            year = parseInt(match[3]);
        }
        if (year < 100) year += 2000;
        if (month === undefined || isNaN(day) || isNaN(year)) return null;
        return new Date(year, month, day).toISOString().split('T')[0];
    }

    function detectLab(text) {
        const t = text.toLowerCase();
        if (t.includes('orange health') || t.includes('orchard healthcare')) return 'Orange Health';
        if (t.includes('tata 1mg') || t.includes('1mg bangalore') || t.includes('mgb')) return 'Tata 1mg';
        if (t.includes('thyrocare')) return 'Thyrocare';
        if (t.includes('healthians')) return 'Healthians';
        if (t.includes('sparsh hospital')) return 'Sparsh Hospital';
        if (t.includes('metropolis')) return 'Metropolis';
        if (t.includes('dr lal') || t.includes('dr. lal')) return 'Dr Lal PathLabs';
        return 'Unknown Lab';
    }

    function parseMarkers(text) {
        const results = {};
        for (const marker of MARKERS) {
            const value = findValue(text, marker);
            if (value !== null) results[marker.key] = value;
        }
        return results;
    }

    function findValue(text, marker) {
        for (const namePattern of marker.names) {
            let regex;
            try { regex = new RegExp(namePattern, 'i'); } catch(e) { continue; }
            const match = text.match(regex);
            if (!match) continue;

            const pos = match.index;
            const context = text.substring(pos, Math.min(pos + 400, text.length));

            // Check exclusions in nearby text
            if (marker.exclude) {
                const nearby = text.substring(Math.max(0, pos - 20), pos + 60);
                if (marker.exclude.some(ex => nearby.toLowerCase().includes(ex.toLowerCase()))) continue;
            }

            // Extract numbers from context (after the marker name)
            const afterName = context.substring(match[0].length);
            const numbers = [];
            const numRegex = /(?<![.\d])(\d+\.?\d*)(?!\.\d)/g;
            let numMatch;
            while ((numMatch = numRegex.exec(afterName)) !== null) {
                const num = parseFloat(numMatch[1]);
                if (!isNaN(num) && isReasonable(marker.key, num)) {
                    numbers.push(num);
                }
                if (numbers.length >= 3) break;
            }

            // First reasonable number is usually the result
            if (numbers.length > 0) return numbers[0];
        }
        return null;
    }

    function isReasonable(key, value) {
        const ranges = {
            tsh:[0.01,100], ft3:[0.5,10], ft4:[0.1,5], totalT3:[30,300], totalT4:[1,20],
            antiTPO:[0,2000], totalCholesterol:[80,400], hdl:[10,120], ldl:[30,300],
            triglycerides:[30,1000], vldl:[5,100], cholHdlRatio:[1,15], vitaminD:[3,150],
            vitaminB12:[50,2000], hba1c:[3,15], fastingGlucose:[40,500], hemoglobin:[5,22],
            platelets:[50,800], wbc:[1,30], esr:[0,100], ast:[5,500], alt:[5,500],
            bilirubin:[0.05,15], albumin:[1,7], creatinine:[0.2,10], uricAcid:[1,15],
            egfr:[10,150], urea:[5,150], sodium:[120,160], potassium:[2,7],
            calcium:[5,15], testosterone:[10,1500]
        };
        const r = ranges[key];
        if (!r) return true;
        return value >= r[0] && value <= r[1];
    }

    async function parsePDF(file) {
        const text = await extractText(file);
        return {
            date: detectDate(text),
            lab: detectLab(text),
            markers: parseMarkers(text),
            fileName: file.name,
            parsedAt: new Date().toISOString(),
            rawTextLength: text.length,
            markersFound: Object.keys(parseMarkers(text)).length
        };
    }

    return { parsePDF, extractText, detectDate, detectLab, parseMarkers, MARKERS };
})();
