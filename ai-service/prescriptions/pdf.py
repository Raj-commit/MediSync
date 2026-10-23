"""
PDF generation for digital prescriptions using ReportLab.

- All text fields are HTML-escaped before being placed in ReportLab Paragraphs
  to prevent XML/markup injection.
- Layout: Title header, patient/doctor metadata, date, table of medicines,
  and a footer disclaimer line.
"""

import html
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def safe_text(value) -> str:
    """
    Escape text for safe inclusion in ReportLab Paragraph XML.
    Prevents markup/XML injection by escaping &, <, >, ", and '.
    Converts newline characters into <br/> tags.
    """
    if value is None:
        return ''
    escaped = html.escape(str(value), quote=True)
    return escaped.replace('\n', '<br/>')


def generate_prescription_pdf(data: dict) -> bytes:
    """
    Generates a clean, professional medical prescription PDF in memory.

    Input data dictionary:
      - prescriptionId: str
      - patientName: str
      - doctorName: str
      - issuedDate: date or str
      - items: list of dicts with 'medicine', 'dosage', 'instructions'

    Returns:
      Raw PDF bytes (starting with %PDF).
    """
    buffer = io.BytesIO()

    # Standard letter page (612 x 792 pt) with 0.5 in (36 pt) margins
    # Printable width: 612 - 72 = 540 pt
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Typography styles
    title_style = ParagraphStyle(
        'PrescriptionTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#0F172A'),  # Slate 900
    )

    subtitle_style = ParagraphStyle(
        'PrescriptionSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#64748B'),  # Slate 500
    )

    meta_label_style = ParagraphStyle(
        'MetaLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#334155'),  # Slate 700
    )

    meta_value_style = ParagraphStyle(
        'MetaValue',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#0F172A'),  # Slate 900
    )

    section_heading_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#1E293B'),  # Slate 800
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=colors.white,
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#0F172A'),
    )

    footer_style = ParagraphStyle(
        'PrescriptionFooter',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        alignment=1,  # Center alignment
        textColor=colors.HexColor('#94A3B8'),  # Slate 400
    )

    story = []

    # 1. Header (Title & Subtitle)
    story.append(Paragraph('MediSync Telemedicine Platform', title_style))
    story.append(Paragraph('Official Digital Medical Prescription', subtitle_style))
    story.append(Spacer(1, 10))
    story.append(
        HRFlowable(
            width='100%',
            thickness=1.5,
            color=colors.HexColor('#2563EB'),  # MediSync Blue
            spaceBefore=0,
            spaceAfter=15,
        )
    )

    # 2. Patient, Doctor, Date, Prescription ID Block
    prescription_id = safe_text(data.get('prescriptionId', ''))
    patient_name = safe_text(data.get('patientName', ''))
    doctor_name = safe_text(data.get('doctorName', ''))
    issued_date = safe_text(data.get('issuedDate', ''))

    meta_data = [
        [
            Paragraph('<b>Patient Name:</b>', meta_label_style),
            Paragraph(patient_name, meta_value_style),
            Paragraph('<b>Prescription ID:</b>', meta_label_style),
            Paragraph(prescription_id, meta_value_style),
        ],
        [
            Paragraph('<b>Prescribing Doctor:</b>', meta_label_style),
            Paragraph(doctor_name, meta_value_style),
            Paragraph('<b>Issued Date:</b>', meta_label_style),
            Paragraph(issued_date, meta_value_style),
        ],
    ]

    # Total width = 110 + 160 + 110 + 160 = 540 pt
    meta_table = Table(meta_data, colWidths=[110, 160, 110, 160])
    meta_table.setStyle(
        TableStyle(
            [
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#F1F5F9')),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 15))

    # 3. Section Heading
    story.append(Paragraph('Prescribed Medications (Rx)', section_heading_style))
    story.append(Spacer(1, 8))

    # 4. Medicines Table
    med_table_data = [
        [
            Paragraph('#', table_header_style),
            Paragraph('Medicine Name', table_header_style),
            Paragraph('Dosage', table_header_style),
            Paragraph('Instructions', table_header_style),
        ]
    ]

    items = data.get('items', [])
    for idx, item in enumerate(items, start=1):
        med_name = safe_text(item.get('medicine', ''))
        dosage = safe_text(item.get('dosage', ''))
        instructions = safe_text(item.get('instructions', ''))

        med_table_data.append(
            [
                Paragraph(str(idx), table_cell_style),
                Paragraph(med_name, table_cell_style),
                Paragraph(dosage, table_cell_style),
                Paragraph(instructions, table_cell_style),
            ]
        )

    # Total width = 30 + 170 + 120 + 220 = 540 pt
    med_table = Table(med_table_data, colWidths=[30, 170, 120, 220], repeatRows=1)

    table_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A8A')),  # Navy header
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
    ]

    # Alternating row background for clean readability
    for row_idx in range(1, len(med_table_data)):
        if row_idx % 2 == 0:
            table_style.append(
                ('BACKGROUND', (0, row_idx), (-1, row_idx), colors.HexColor('#F8FAFC'))
            )

    med_table.setStyle(TableStyle(table_style))
    story.append(med_table)
    story.append(Spacer(1, 20))

    # 5. Footer Line & Disclaimer
    story.append(
        HRFlowable(
            width='100%',
            thickness=0.5,
            color=colors.HexColor('#CBD5E1'),
            spaceBefore=10,
            spaceAfter=10,
        )
    )
    story.append(
        Paragraph(
            'This digital prescription was generated electronically through MediSync. '
            'It is valid only when issued by an authorised registered medical practitioner.',
            footer_style,
        )
    )

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
