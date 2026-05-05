Analiza todos los archivos Excel de la carpeta info y consolida la informacion para poblar completamente el dashboard de ContractFlow.

Contexto de archivos a procesar:
- contratos vigentes al 21-04-2026.xlsx
- contratos_vencen dic 26.xls
- Contratos_Vencidos_2025.xlsx

Objetivo:
Construir un dataset consolidado, limpio y consistente para alimentar el dashboard de contratos, respetando la logica funcional de la herramienta. Debes extraer, normalizar, deduplicar, clasificar y devolver toda la informacion necesaria para KPIs, graficos, tabla de contratos, filtros globales y configuracion de riesgo.

Instrucciones:
1. Lee los tres archivos completos, identifica la hoja relevante en cada uno y determina si contienen contratos vigentes, contratos por vencer o contratos vencidos.
2. Detecta automaticamente encabezados equivalentes aunque cambien de nombre. Considera aliases como:
   - cliente, client, empresa, company
   - tipo, contract type, tipo de contrato
   - fecha inicio, inicio, start date
   - fecha fin, vencimiento, fecha vencimiento, end date
   - estado, status
   - ingreso mensual, monthly revenue, revenue
   - rentabilidad, profitability, margen
   - responsable, owner, commercial owner, responsable comercial
3. Genera un unico registro por contrato. Si el mismo contrato aparece en varios archivos, conserva la version mas reciente y coherente segun estas reglas:
   - prioriza la fila con mayor completitud de campos
   - si hay conflicto de estado, usa el archivo cuya fecha o contexto sea mas reciente
   - si un contrato aparece en vigentes y vencidos, valida las fechas y deja el estado consistente con la fecha de fin real
4. Normaliza fechas al formato YYYY-MM-DD.
5. Normaliza estados exclusivamente a uno de estos valores canonicos internos:
   - ACTIVE
   - AT RISK
   - LOST
   - RENEWED
6. Aplica reglas de clasificacion sugeridas:
   - ACTIVE: contrato vigente en la fecha de corte
   - AT RISK: contrato que vence dentro del umbral configurable o marcado como en riesgo
   - LOST: contrato vencido sin renovacion o expresamente perdido
   - RENEWED: contrato renovado o reemplazado por uno nuevo
7. Si falta el estado pero existe fecha de vencimiento, infierelo usando la fecha de corte 2026-04-21:
   - fecha fin pasada y sin evidencia de renovacion: LOST
   - fecha fin futura dentro del umbral de riesgo: AT RISK
   - fecha fin futura fuera del umbral: ACTIVE
8. Calcula o prepara todos los campos requeridos por el dashboard:
   - client
   - contract_type
   - start_date
   - end_date
   - status
   - monthly_revenue
   - profitability
   - commercial_owner
   - risk_score si puede inferirse, o dejalo en 0 si no existe base suficiente
9. Genera los datos necesarios para estas vistas:
   - KPIs: activos totales, proximos a vencer, perdidos, ingreso mensual, rentabilidad media
   - grafico donut por estado
   - evolucion mensual de ingresos
   - ingresos en riesgo por mes
   - tabla de vencimientos proximos por mes
   - tabla detallada de contratos
   - listas de filtros unicos por cliente, tipo y responsable
10. Si un valor numerico viene con simbolos de moneda, comas, puntos mezclados o porcentaje, limpialo y conviertelo a numero.
11. Reporta explicitamente errores de calidad de datos sin detener el proceso:
   - filas vacias
   - fechas invalidas
   - clientes faltantes
   - duplicados conflictivos
   - ingresos no parseables
12. No inventes datos. Si un campo no puede inferirse con evidencia suficiente, devuelvelo vacio o en 0 segun corresponda y deja constancia en observaciones.

Salida esperada:
1. Un resumen ejecutivo con:
   - total de archivos leidos
   - total de filas procesadas
   - total de contratos consolidados
   - total de errores o advertencias
2. Una tabla o JSON con los contratos finales listos para importar.
3. Un bloque JSON para dashboard con esta estructura:
   {
     "kpis": {
       "totalActive": 0,
       "expiringSoon": 0,
       "lost": 0,
       "monthlyRevenue": 0,
       "avgProfitability": 0
     },
     "charts": {
       "doughnut": [],
       "revenueEvolution": {
         "months": [],
         "current": [],
         "previous": []
       },
       "revenueAtRisk": {
         "months": [],
         "values": []
       }
     },
     "expiry": [],
     "contracts": [],
     "filterOptions": {
       "clients": [],
       "types": [],
       "owners": []
     },
     "warnings": []
   }
4. Una seccion final llamada "Supuestos aplicados" explicando cualquier inferencia relevante.

Criterios de calidad:
- Prioriza consistencia funcional sobre literalidad del Excel.
- Mantén trazabilidad entre la fila original y el contrato consolidado.
- No mezcles contratos distintos por similitud parcial de nombre.
- Si hay dudas de duplicado, marca advertencia y conserva ambos con observacion.
- La salida debe quedar lista para ser importada por el backend del dashboard sin retrabajo manual.