import type { WalletReport } from '../domain/types'
import { money, shortDate } from './format'

function latin(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\xFF]/g, '?').replace(/([\\()])/g, '\\$1')
}

function line(text: string, x: number, y: number, size = 10, bold = false) {
  return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${latin(text)}) Tj ET\n`
}

export function buildReportPdf(report: WalletReport, profileName: string) {
  const rows: string[] = []
  const add = (value = '') => rows.push(value)
  add('RITMO')
  add(report.scope === 'shared' ? 'Relatorio do casal' : `Relatorio pessoal - ${profileName}`)
  add(`Periodo: ${shortDate(report.from)} a ${shortDate(report.to)}`)
  add('')
  add(`Saldo atual: ${money(report.summary.current_balance)}`)
  add(`Entradas realizadas: ${money(report.summary.income)}`)
  add(`Saidas pagas: ${money(report.summary.expenses)}`)
  add(`A receber: ${money(report.summary.receivable)}`)
  add(`A pagar: ${money(report.summary.pending)}`)
  add(`Resultado do periodo: ${money(report.summary.period_result)}`)
  if (report.summary.transfers) add(`${report.scope === 'shared' ? 'Contribuicoes recebidas' : 'Transferido ao casal'}: ${money(report.summary.transfers)}`)
  add('')
  add('ENTRADAS')
  const incomes = report.scope === 'shared' ? report.shared?.incomes || [] : report.personal?.incomes || []
  incomes.forEach((item) => add(`${shortDate(item.date)}  ${item.description}  ${money(item.amount)}`))
  if (!incomes.length) add('Nenhuma entrada no periodo.')
  add('')
  add('SAIDAS')
  const expenses = report.scope === 'shared' ? report.shared?.expenses || [] : report.personal?.expenses || []
  expenses.forEach((item) => add(`${shortDate(item.date)}  ${item.description}  ${money(item.amount)}  ${item.status}`))
  if (!expenses.length) add('Nenhuma saida no periodo.')
  if (report.transfers.length) {
    add('')
    add(report.scope === 'shared' ? 'CONTRIBUICOES AO CASAL' : 'TRANSFERENCIAS AO CASAL')
    report.transfers.forEach((item) => add(`${shortDate(item.date)}  ${item.created_by_name || profileName}  ${money(item.amount)}${item.description ? `  ${item.description}` : ''}`))
    add('Transferencias entre carteiras nao sao contabilizadas como nova receita.')
  }

  const pageRows = 43
  const pages: string[][] = []
  for (let i = 0; i < rows.length; i += pageRows) pages.push(rows.slice(i, i + pageRows))
  const objects: string[] = []
  const addObject = (body: string) => { objects.push(body); return objects.length }
  const fontRegular = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const fontBold = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')
  const pagesId = addObject('')
  const pageIds: number[] = []

  pages.forEach((page, pageIndex) => {
    let content = line('Ritmo', 48, 795, 17, true)
    let y = 765
    page.forEach((row, index) => {
      const heading = ['RITMO', 'ENTRADAS', 'SAIDAS', 'CONTRIBUICOES AO CASAL', 'TRANSFERENCIAS AO CASAL'].includes(row)
      if (row === 'RITMO') return
      content += line(row.slice(0, 105), 48, y, heading ? 11 : 9.5, heading)
      y -= row === '' ? 10 : 16
    })
    content += line(`Pagina ${pageIndex + 1} de ${pages.length}`, 48, 34, 8)
    const streamId = addObject(`<< /Length ${content.length} >>\nstream\n${content}endstream`)
    pageIds.push(addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${streamId} 0 R >>`))
  })
  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

  let pdf = '%PDF-1.4\n%Ritmo\n'
  const offsets = [0]
  objects.forEach((body, index) => { offsets[index + 1] = pdf.length; pdf += `${index + 1} 0 obj\n${body}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([new TextEncoder().encode(pdf)], { type: 'application/pdf' })
}

export async function deliverPdf(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: 'application/pdf' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Relatório Ritmo' }); return } catch { /* usuário pode cancelar */ }
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
