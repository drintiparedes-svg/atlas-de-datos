# Minuta: acuerdos del equipo de registro (documento ficticio)

Documento sintético para pruebas del adaptador markdown. No corresponde a una reunión real.

## 1. Decisiones sobre variables

- Fecha de emisión diagnóstico: se toma como fecha índice del caso; debe coincidir con `fecha_emision_dx` en la base [[Fecha de nacimiento]].
- Estado Vital: se registrará como Vivo / Fallecido / Desconocido.
- Causa de defunción: codificada con CIE-10, edición vigente.
- Ki-67: porcentaje de células positivas, entero de 0 a 100.

## 2. Tareas

- Definir cardinalidad de comités y tratamientos: pendiente, responsable equipo de registro.
- Completar dominios de valores de las variables categóricas.

## 3. Diccionario complementario

| Variable | Tipo | Dominio | Descripción |
|---|---|---|---|
| Tipo de Comité | categorica | Digestivo; Mama; Tórax; Urología | Comité oncológico donde se presenta el caso |
| Intención de la resolución | categorica | Curativa; Paliativa | Intención acordada en comité |
| Fecha de comité | fecha | | Fecha de la sesión |
| Número de Informe diagnóstico | identificador | | Folio del informe anatomopatológico |
