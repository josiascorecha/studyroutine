"""Gera um PDF de teste no layout do livro do texto diário (2 colunas, título por dia).
Conteúdo fictício, só para os testes ponta a ponta: nenhum texto do jw.org.
Uso: python3 scripts/gerar-pdf-teste.py ANO SAIDA.pdf (requer reportlab e as fontes DejaVu)"""
import sys, datetime
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

year, out = int(sys.argv[1]), sys.argv[2]
# Fontes embutidas, como no livro oficial (o app desenha os glifos sem carregar fontes do sistema).
pdfmetrics.registerFont(TTFont('Serif', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'))
pdfmetrics.registerFont(TTFont('SansBold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
W, H = 314.64, 450
DIAS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
c = canvas.Canvas(out, pagesize=(W, H))
c.setFont('SansBold', 12); c.drawString(20, 400, f'Livro de teste {year}'); c.showPage()
d = datetime.date(year, 1, 1)
col, y = 0, 432
def newcol():
    global col, y
    if col == 0: col = 1
    else:
        c.showPage(); col = 0
    y = 432
while d.year == year:
    x = 17 if col == 0 else 161.5
    if y < 60: newcol(); x = 17 if col == 0 else 161.5
    c.setFont('SansBold', 7.9)
    num = '1.º' if d.day == 1 else str(d.day)
    c.drawString(x, y, f'{DIAS[d.weekday()]}, {num} de {MESES[d.month-1]}')
    y -= 13
    c.setFont('Serif', 7.7)
    lines = 14 if d.day % 2 else 22
    for i in range(lines):
        if y < 15: newcol(); x = 17 if col == 0 else 161.5
        c.drawString(x, y, f'Linha {i+1} do dia {d.day}/{d.month}, teste.')
        y -= 9.5
    y -= 8
    d += datetime.timedelta(days=1)
c.showPage(); c.save()
