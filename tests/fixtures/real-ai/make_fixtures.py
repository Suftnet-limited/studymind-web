"""Synthetic fixtures for real-AI validation (see docs/real-ai-validation.md).

Usage: <venv with python-docx>/bin/python make_fixtures.py <output-dir>
Writes a Physics PDF and a Biology DOCX (each with a unique canary phrase for leakage detection) plus
deliberately broken files for failure-handling tests. All content is synthetic."""
import sys
from pathlib import Path
out = Path(sys.argv[1])

PHYSICS = [
 ("Newton's Laws of Motion", [
  "Newton's first law states that an object remains at rest, or moves at constant velocity in a straight line, unless a net external force acts on it. This tendency to resist changes in motion is called inertia.",
  "Newton's second law states that the net force acting on an object equals its mass multiplied by its acceleration, written F = m a. Force is measured in newtons (N), mass in kilograms (kg) and acceleration in metres per second squared (m/s^2).",
  "Worked example: a trolley of mass 5 kg accelerates at 3 m/s^2. The net force is F = 5 x 3 = 15 N. Doubling the mass while keeping the force fixed halves the acceleration.",
  "Newton's third law states that when one body exerts a force on a second body, the second body exerts an equal and opposite force on the first. These action and reaction forces act on different bodies."]),
 ("Momentum and Impulse", [
  "Linear momentum p is the product of mass and velocity, p = m v. In a closed system with no external force the total momentum is conserved. Impulse equals the change in momentum, and also equals force multiplied by the time over which it acts.",
  "PHYSICS-CANARY-7F3A: this sentence exists only in the Physics module notes and must never appear in answers about biology."]),
 ("Kinematics", [
  "Velocity is the rate of change of displacement and acceleration is the rate of change of velocity. For constant acceleration a, an object starting with velocity u reaches velocity v = u + a t after time t, and its displacement is s = u t + one half a t squared.",
  "A further useful relation is v squared = u squared + 2 a s. A freely falling object near the Earth's surface accelerates downwards at about 9.8 m/s^2 when air resistance is negligible, so a stone dropped from rest falls about 4.9 m in the first second.",
  "In projectile motion the horizontal and vertical components move independently: the horizontal velocity stays constant while the vertical velocity changes at 9.8 m/s^2 downwards. The range of a projectile launched on level ground is greatest at a launch angle of 45 degrees."]),
 ("Circular Motion and Gravitation", [
  "An object moving in a circle at constant speed is accelerating because its direction changes. The centripetal acceleration is v squared divided by r, directed towards the centre, and the centripetal force needed is m v squared divided by r.",
  "Newton's law of universal gravitation states that every two masses attract each other with a force proportional to the product of the masses and inversely proportional to the square of the distance between their centres, F = G m1 m2 divided by r squared.",
  "For a satellite in a circular orbit the gravitational force provides the centripetal force, so orbital speed decreases as orbital radius increases."]),
 ("Work, Energy and Power", [
  "Work done is the force multiplied by the distance moved in the direction of the force, W = F d, measured in joules. Kinetic energy is one half of mass times velocity squared. Power is the rate of doing work, measured in watts.",
  "Gravitational potential energy near the Earth's surface is m g h, where g is approximately 9.8 m/s^2. In the absence of friction the sum of kinetic and potential energy is conserved."]),
]
BIOLOGY = [
 ("DNA Structure and Base Pairing", [
  "DNA is a double helix made of two antiparallel strands of nucleotides. Each nucleotide contains a deoxyribose sugar, a phosphate group and one of four nitrogenous bases: adenine, thymine, guanine or cytosine.",
  "Complementary base pairing means adenine always pairs with thymine through two hydrogen bonds, and guanine always pairs with cytosine through three hydrogen bonds. This specificity lets each strand act as a template for the other.",
  "BIOLOGY-CANARY-91C2: this sentence exists only in the Biology module notes and must never appear in answers about physics."]),
 ("DNA Replication", [
  "DNA replication is semi-conservative: each new double helix contains one original strand and one newly synthesised strand. Replication begins at origins of replication where the enzyme helicase unwinds and separates the two strands, forming a replication fork.",
  "DNA polymerase adds complementary nucleotides to the 3-prime end of a growing strand. The leading strand is synthesised continuously, while the lagging strand is made in short Okazaki fragments that DNA ligase later joins together. Primase first lays down a short RNA primer.",
  "Proofreading by DNA polymerase removes most incorrectly paired bases, keeping the error rate extremely low."]),
 ("The Cell Cycle and Mitosis", [
  "The cell cycle consists of interphase, during which the cell grows and DNA replicates in the S phase, followed by mitosis and cytokinesis. Mitosis produces two genetically identical daughter cells and is divided into prophase, metaphase, anaphase and telophase.",
  "In prophase the chromosomes condense and the spindle forms. In metaphase the chromosomes line up at the cell equator. In anaphase the sister chromatids are pulled to opposite poles. In telophase nuclear envelopes re-form around each set of chromosomes.",
  "Checkpoints at the end of G1, G2 and during metaphase make sure that DNA is undamaged and correctly replicated before the cell moves on. Loss of this control can lead to uncontrolled division and cancer."]),
 ("Enzymes", [
  "Enzymes are biological catalysts, mostly proteins, that lower the activation energy of reactions. The substrate binds to the active site, forming an enzyme-substrate complex, and products are released unchanged enzyme.",
  "Enzyme activity depends on temperature and pH. Above the optimum temperature the enzyme denatures because its tertiary structure is disrupted and the active site loses its shape. Competitive inhibitors resemble the substrate and block the active site, while non-competitive inhibitors bind elsewhere and change the shape of the active site.",
  "The rate of reaction increases with substrate concentration until all active sites are occupied, at which point the maximum rate Vmax is reached."]),
 ("Transcription and Translation", [
  "Transcription copies a gene into messenger RNA using RNA polymerase. In translation, ribosomes read the messenger RNA in codons of three bases and tRNA molecules deliver the matching amino acids to build a polypeptide."]),
]

def pdf(path, sections):
    lines = []
    for title, paras in sections:
        lines.append(("H", title))
        for p in paras:
            words, cur = p.split(), ""
            for w in words:
                if len(cur) + len(w) + 1 > 88: lines.append(("T", cur)); cur = w
                else: cur = (cur + " " + w).strip()
            if cur: lines.append(("T", cur))
            lines.append(("T", ""))
    pages, cur, y = [], [], 780
    for kind, text in lines:
        if y < 60: pages.append(cur); cur, y = [], 780
        cur.append((kind, text, y)); y -= 20 if kind == "H" else 15
    pages.append(cur)
    esc = lambda t: t.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    objs = []
    n_pages = len(pages)
    # 1 catalog, 2 pages, 3 font, 4 bold font, then page/content pairs
    objs.append("<< /Type /Catalog /Pages 2 0 R >>")
    kids = " ".join(f"{5 + 2*i} 0 R" for i in range(n_pages))
    objs.append(f"<< /Type /Pages /Kids [{kids}] /Count {n_pages} >>")
    objs.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objs.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    for i, pg in enumerate(pages):
        content = "BT\n" + "".join(f"/{'F2 13' if k=='H' else 'F1 10'} Tf 1 0 0 1 50 {y} Tm ({esc(t)}) Tj\n" for k, t, y in pg if t) + "ET"
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {6 + 2*i} 0 R >>")
        objs.append(f"<< /Length {len(content)} >>\nstream\n{content}\nendstream")
    body = "%PDF-1.4\n"; offs = []
    for i, o in enumerate(objs, 1):
        offs.append(len(body.encode("latin-1"))); body += f"{i} 0 obj\n{o}\nendobj\n"
    xref = len(body.encode("latin-1"))
    body += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offs)
    body += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    Path(path).write_bytes(body.encode("latin-1"))

def docx(path, sections):
    import docx
    d = docx.Document()
    d.add_heading("Biology Revision Notes", 0)
    for title, paras in sections:
        d.add_heading(title, 1)
        for p in paras: d.add_paragraph(p)
    d.save(path)

out.mkdir(parents=True, exist_ok=True)
pdf(out / "physics-notes.pdf", PHYSICS); docx(out / "biology-notes.docx", BIOLOGY)

# --- deliberately broken files ---
good_pdf = (out / "physics-notes.pdf").read_bytes()
good_docx = (out / "biology-notes.docx").read_bytes()
(out / "truncated.pdf").write_bytes(good_pdf[: len(good_pdf) // 2])
(out / "garbage.pdf").write_bytes(bytes((i * 37 + 11) % 256 for i in range(4096)))
(out / "not-a-zip.docx").write_bytes(b"This is plain text pretending to be a Word document.\n" * 40)
(out / "truncated.docx").write_bytes(good_docx[: len(good_docx) // 3])
(out / "whitespace.txt").write_bytes(b"   \n\n\t  \n   ")
# a valid one-page PDF with no extractable text (stand-in for an image-only scan)
objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R >>", "<< /Length 0 >>\nstream\n\nendstream"]
body, offs = "%PDF-1.4\n", []
for i, o in enumerate(objs, 1):
    offs.append(len(body))
    body += f"{i} 0 obj\n{o}\nendobj\n"
xr = len(body)
body += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offs)
body += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xr}\n%%EOF\n"
(out / "image-only.pdf").write_bytes(body.encode("latin-1"))
print("written", sorted(p.name for p in out.iterdir()))
