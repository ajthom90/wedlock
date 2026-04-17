import ExcelJS from 'exceljs';
import path from 'path';

const COLUMNS = [
  'Household Name',
  'Email',
  'Contact Email',
  'Address Line 1',
  'Address Line 2',
  'City',
  'State',
  'Postal Code',
  'Plus-Ones Allowed',
  'Notes',
  'Guest 1', 'Guest 2', 'Guest 3', 'Guest 4', 'Guest 5',
  'Guest 6', 'Guest 7', 'Guest 8', 'Guest 9', 'Guest 10',
];

async function build() {
  const wb = new ExcelJS.Workbook();

  // Sheet 1: Invitations — the actual data sheet.
  const sheet = wb.addWorksheet('Invitations');
  sheet.addRow(COLUMNS);
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E7D9' } };
  });
  // Two sample rows so the format is obvious at a glance.
  sheet.addRow([
    'The Sample Family', 'sample@example.com', '', '123 Main St', '', 'Springfield', 'IL', '62704',
    0, '', 'Jane Sample', 'John Sample', '', '', '', '', '', '', '', '',
  ]);
  sheet.addRow([
    'The Plus-One Family', 'plus@example.com', '', '456 Oak Ave', 'Apt 2', 'Chicago', 'IL', '60601',
    2, 'Knows the bride from college', 'Alex Plus', '', '', '', '', '', '', '', '', '',
  ]);
  // Widen the household and address columns so the sheet is legible in Excel.
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 24;
  sheet.getColumn(3).width = 24;
  sheet.getColumn(4).width = 24;
  sheet.getColumn(5).width = 16;
  sheet.getColumn(6).width = 18;
  sheet.getColumn(7).width = 10;
  sheet.getColumn(8).width = 12;
  sheet.getColumn(9).width = 18;
  sheet.getColumn(10).width = 30;
  for (let i = 11; i <= 20; i++) sheet.getColumn(i).width = 18;

  // Sheet 2: Instructions — plain-language per-column guidance.
  const inst = wb.addWorksheet('Instructions');
  inst.addRow(['Edit Sheet 1 ("Invitations"). Delete the two sample rows before uploading.']);
  inst.addRow([]);
  inst.addRow(['Column', 'Meaning']);
  inst.getRow(3).font = { bold: true };
  const rows: Array<[string, string]> = [
    ['Household Name', 'Required. e.g. "The Smith Family", "John and Jane", "Grandma Rose".'],
    ['Email', 'Optional. Your contact email for this household (for chasing late RSVPs).'],
    ['Contact Email', 'Optional. Pre-fills the "Stay in the loop" field on their RSVP form. Guests can override.'],
    ['Address Line 1', 'Optional. Street address for mailing labels.'],
    ['Address Line 2', 'Optional. Apt / suite / unit.'],
    ['City', 'Optional.'],
    ['State', 'Optional. Free text — US state abbreviation or international region.'],
    ['Postal Code', 'Optional. Free text — ZIP or international postal code.'],
    ['Plus-Ones Allowed', 'Optional. Whole number 0+. How many un-named extras this household may bring. Defaults to 0.'],
    ['Notes', 'Optional. Admin-only notes (never shown to guests).'],
    ['Guest 1 – Guest 10', 'Optional. Named guests in this household. First non-empty column becomes the primary guest. Leave extra columns blank.'],
  ];
  for (const [col, meaning] of rows) inst.addRow([col, meaning]);
  inst.getColumn(1).width = 22;
  inst.getColumn(2).width = 80;

  const outPath = path.resolve(__dirname, '..', 'public', 'invitation-import-template.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath}`);
}

build().catch((e) => { console.error(e); process.exit(1); });
