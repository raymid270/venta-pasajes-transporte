<script setup>
import { ref, computed, onMounted } from 'vue';
import { db } from './firebase';
import { ref as dbRef, push, set, onValue, remove } from 'firebase/database';

// --- NAVEGACIÓN ---
const pestanaActiva = ref('ventas'); // 'ventas' | 'flota' | 'choferes'

// --- ESTADO DE DATOS (FIREBASE) ---
const flota = ref([]);
const choferes = ref([]);
const boletos = ref([]);

// --- FORMULARIOS ADMINISTRATIVOS ---
const nuevoBus = ref({ placa: '', modelo: '', numeroUnidad: '' });
const nuevoChofer = ref({ nombres: '', dni: '', licencia: '', telefono: '' });

// --- ESTADO DE VENTA ---
const sentidoViaje = ref('IDA'); // 'IDA' (Pauza -> Lima) | 'VUELTA' (Lima -> Pauza)
const fechaViaje = ref(new Date().toISOString().split('T')[0]);
const busSeleccionadoId = ref('');
const choferSeleccionadoId = ref('');

// Orden de paradas para validar tramos en el mismo bus
const paradasIda = ['Pauza', 'Nasca', 'Ica', 'Lima'];
const paradasVuelta = ['Lima', 'Ica', 'Nasca', 'Pauza'];

const origen = ref('Pauza');
const destino = ref('Lima');
const asientoSeleccionado = ref(null);
const pasajero = ref({ nombre: '', dni: '', precio: 80 });
const boletoParaImprimir = ref(null);

// --- CARGAR DATOS EN TIEMPO REAL ---
onMounted(() => {
  onValue(dbRef(db, 'flota'), (snap) => {
    const data = snap.val();
    flota.value = data ? Object.entries(data).map(([id, val]) => ({ id, ...val })) : [];
    if (flota.value.length > 0 && !busSeleccionadoId.value) {
      busSeleccionadoId.value = flota.value[0].id;
    }
  });

  onValue(dbRef(db, 'choferes'), (snap) => {
    const data = snap.val();
    choferes.value = data ? Object.entries(data).map(([id, val]) => ({ id, ...val })) : [];
    if (choferes.value.length > 0 && !choferSeleccionadoId.value) {
      choferSeleccionadoId.value = choferes.value[0].id;
    }
  });

  onValue(dbRef(db, 'boletos'), (snap) => {
    const data = snap.val();
    boletos.value = data ? Object.entries(data).map(([id, val]) => ({ id, ...val })) : [];
  });
});

// --- LÓGICA DE TRAMOS Y ASIENTOS (39 ASIENTOS) ---
const paradasActuales = computed(() => (sentidoViaje.value === 'IDA' ? paradasIda : paradasVuelta));

const cambiarSentido = () => {
  if (sentidoViaje.value === 'IDA') {
    origen.value = 'Pauza';
    destino.value = 'Lima';
  } else {
    origen.value = 'Lima';
    destino.value = 'Pauza';
  }
  asientoSeleccionado.value = null;
};

// Verifica si dos tramos se cruzan en el mismo viaje
const tramosSeCruzan = (origA, destA, origB, destB) => {
  const lista = paradasActuales.value;
  const iOrigA = lista.indexOf(origA);
  const iDestA = lista.indexOf(destA);
  const iOrigB = lista.indexOf(origB);
  const iDestB = lista.indexOf(destB);
  return Math.max(iOrigA, iOrigB) < Math.min(iDestA, iDestB);
};

// Filtra boletos vendidos para la fecha, bus, sentido y tramo actual
const boletosDelViajeActual = computed(() => {
  return boletos.value.filter(
    (b) =>
      b.fecha === fechaViaje.value &&
      b.busId === busSeleccionadoId.value &&
      b.sentido === sentidoViaje.value
  );
});

const estaAsientoOcupado = (numAsiento) => {
  return boletosDelViajeActual.value.some(
    (b) =>
      b.asiento === numAsiento &&
      tramosSeCruzan(origen.value, destino.value, b.origen, b.destino)
  );
};

// Generación de croquis de 39 asientos (9 filas de 4 + 1 fila trasera de 3)
const filasBus = computed(() => {
  const filas = [];
  let num = 1;
  // 9 filas estándar: [Ventana Izq, Pasillo Izq, PASILLO, Pasillo Der, Ventana Der]
  for (let f = 0; f < 9; f++) {
    filas.push([
      { numero: num++, ubicacion: 'Ventana' },
      { numero: num++, ubicacion: 'Pasillo' },
      null, // Espacio del pasillo central
      { numero: num++, ubicacion: 'Pasillo' },
      { numero: num++, ubicacion: 'Ventana' }
    ]);
  }
  // Fila 10 (fondo): 3 asientos para completar 39
  filas.push([
    { numero: num++, ubicacion: 'Ventana' },
    { numero: num++, ubicacion: 'Pasillo' },
    { numero: num++, ubicacion: 'Ventana' },
    null,
    null
  ]);
  return filas;
});

const seleccionarAsiento = (asiento) => {
  if (!asiento || estaAsientoOcupado(asiento.numero)) return;
  asientoSeleccionado.value = asiento;
};

// --- ACCIONES CRUD FIREBASE ---
const agregarBus = async () => {
  if (!nuevoBus.value.placa || !nuevoBus.value.numeroUnidad) return alert('Complete placa y N° unidad');
  await push(dbRef(db, 'flota'), { ...nuevoBus.value });
  nuevoBus.value = { placa: '', modelo: '', numeroUnidad: '' };
};

const eliminarBus = async (id) => {
  await remove(dbRef(db, `flota/${id}`));
};

const agregarChofer = async () => {
  if (!nuevoChofer.value.nombres || !nuevoChofer.value.dni) return alert('Complete nombres y DNI');
  await push(dbRef(db, 'choferes'), { ...nuevoChofer.value });
  nuevoChofer.value = { nombres: '', dni: '', licencia: '', telefono: '' };
};

const eliminarChofer = async (id) => {
  await remove(dbRef(db, `choferes/${id}`));
};

const venderBoleto = async () => {
  const lista = paradasActuales.value;
  if (lista.indexOf(origen.value) >= lista.indexOf(destino.value)) {
    return alert('El destino debe ser posterior al origen en la ruta seleccionada.');
  }
  if (!busSeleccionadoId.value || !choferSeleccionadoId.value) {
    return alert('Debe registrar y seleccionar un Bus y un Chofer.');
  }
  if (!asientoSeleccionado.value) return alert('Seleccione un asiento en el croquis.');
  if (!pasajero.value.nombre || !pasajero.value.dni) return alert('Ingrese los datos del pasajero.');

  const busObj = flota.value.find((b) => b.id === busSeleccionadoId.value);
  const choferObj = choferes.value.find((c) => c.id === choferSeleccionadoId.value);

  const nuevoRegistro = {
    codigo: 'BOL-' + Date.now().toString().slice(-6),
    fecha: fechaViaje.value,
    sentido: sentidoViaje.value,
    origen: origen.value,
    destino: destino.value,
    asiento: asientoSeleccionado.value.numero,
    ubicacionAsiento: asientoSeleccionado.value.ubicacion,
    pasajeroNombre: pasajero.value.nombre,
    pasajeroDni: pasajero.value.dni,
    precio: pasajero.value.precio,
    busId: busObj.id,
    busPlaca: busObj.placa,
    busUnidad: busObj.numeroUnidad,
    choferNombre: choferObj.nombres,
    fechaEmision: new Date().toLocaleString()
  };

  const refNuevo = push(dbRef(db, 'boletos'));
  await set(refNuevo, nuevoRegistro);

  boletoParaImprimir.value = nuevoRegistro;
  pasajero.value = { nombre: '', dni: '', precio: 80 };
  asientoSeleccionado.value = null;
};

const imprimirTicket = () => {
  window.print();
};
</script>

<template>
  <div class="contenedor">
    <!-- ENCABEZADO (Se oculta al imprimir) -->
    <header class="no-print">
      <h1>🚌 Transporte Interprovincial Pauza - Lima</h1>
      <nav class="menu">
        <button :class="{ activo: pestanaActiva === 'ventas' }" @click="pestanaActiva = 'ventas'">
          Venta de Boletos
        </button>
        <button :class="{ activo: pestanaActiva === 'flota' }" @click="pestanaActiva = 'flota'">
          Administrar Flota ({{ flota.length }})
        </button>
        <button :class="{ activo: pestanaActiva === 'choferes' }" @click="pestanaActiva = 'choferes'">
          Administrar Choferes ({{ choferes.length }})
        </button>
      </nav>
    </header>

    <!-- MÓDULO 1: VENTA DE PASAJES -->
    <main v-if="pestanaActiva === 'ventas'" class="grid-ventas no-print">
      <!-- PANEL IZQUIERDO: CROQUIS DEL BUS -->
      <section class="card">
        <h2>Croquis del Bus (39 Asientos)</h2>
        <div class="leyenda">
          <span class="badge libre">Libre</span>
          <span class="badge seleccionado">Seleccionado</span>
          <span class="badge ocupado">Ocupado en este tramo</span>
        </div>

        <div class="bus-carroceria">
          <div class="cabina">🧑‍✈️ Volante / Chofer &nbsp;&nbsp;|&nbsp;&nbsp; 🚪 Puerta</div>
          <div v-for="(fila, idx) in filasBus" :key="idx" class="fila-asientos">
            <template v-for="(asiento, cIdx) in fila" :key="cIdx">
              <div v-if="!asiento" class="pasillo-central"></div>
              <button
                v-else
                class="asiento"
                :class="{
                  ocupado: estaAsientoOcupado(asiento.numero),
                  seleccionado: asientoSeleccionado?.numero === asiento.numero
                }"
                :disabled="estaAsientoOcupado(asiento.numero)"
                @click="seleccionarAsiento(asiento)"
                :title="`Asiento ${asiento.numero} (${asiento.ubicacion})`"
              >
                <strong>{{ asiento.numero }}</strong>
                <small>{{ asiento.ubicacion === 'Ventana' ? 'V' : 'P' }}</small>
              </button>
            </template>
          </div>
        </div>
        <p class="nota"><strong>V:</strong> Ventana &nbsp;|&nbsp; <strong>P:</strong> Pasillo</p>
      </section>

      <!-- PANEL DERECHO: DATOS DEL VIAJE Y PASAJERO -->
      <section class="card">
        <h2>Datos del Viaje y Pasajero</h2>

        <div class="form-grid">
          <label>
            Sentido de Ruta:
            <select v-model="sentidoViaje" @change="cambiarSentido">
              <option value="IDA">Pauza ➔ Nasca ➔ Ica ➔ Lima</option>
              <option value="VUELTA">Lima ➔ Ica ➔ Nasca ➔ Pauza</option>
            </select>
          </label>

          <label>
            Fecha de Viaje:
            <input type="date" v-model="fechaViaje" />
          </label>

          <label>
            Origen:
            <select v-model="origen" @change="asientoSeleccionado = null">
              <option v-for="p in paradasActuales.slice(0, -1)" :key="p" :value="p">{{ p }}</option>
            </select>
          </label>

          <label>
            Destino:
            <select v-model="destino" @change="asientoSeleccionado = null">
              <option v-for="p in paradasActuales.slice(1)" :key="p" :value="p">{{ p }}</option>
            </select>
          </label>

          <label>
            Unidad / Bus:
            <select v-model="busSeleccionadoId">
              <option disabled value="">Seleccione un bus</option>
              <option v-for="b in flota" :key="b.id" :value="b.id">
                Unidad {{ b.numeroUnidad }} - {{ b.placa }} ({{ b.modelo }})
              </option>
            </select>
          </label>

          <label>
            Chofer Asignado:
            <select v-model="choferSeleccionadoId">
              <option disabled value="">Seleccione un chofer</option>
              <option v-for="c in choferes" :key="c.id" :value="c.id">
                {{ c.nombres }} (Lic: {{ c.licencia }})
              </option>
            </select>
          </label>
        </div>

        <hr />

        <div v-if="asientoSeleccionado" class="alerta-asiento">
          Asiento seleccionado: <strong>N° {{ asientoSeleccionado.numero }}</strong> ({{ asientoSeleccionado.ubicacion }})
        </div>
        <div v-else class="alerta-asiento neutro">
          Haga clic en un asiento disponible en el croquis.
        </div>

        <div class="form-grid">
          <label>
            Nombres y Apellidos del Pasajero:
            <input type="text" v-model="pasajero.nombre" placeholder="Ej. Juan Pérez" />
          </label>

          <label>
            DNI / Documento:
            <input type="text" v-model="pasajero.dni" maxlength="12" placeholder="Ej. 71234567" />
          </label>

          <label>
            Tarifa (S/.):
            <input type="number" v-model="pasajero.precio" min="1" />
          </label>
        </div>

        <button class="btn-primario" @click="venderBoleto">
          Emitir Boleto y Generar Vista de Impresión
        </button>

        <!-- LISTADO RÁPIDO DE BOLETOS VENDIDOS EN ESTE BUS -->
        <div class="lista-vendidos" v-if="boletosDelViajeActual.length">
          <h3>Pasajeros registrados en este bus ({{ fechaViaje }})</h3>
          <table>
            <thead>
              <tr>
                <th>Asiento</th>
                <th>Pasajero</th>
                <th>Tramo</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in boletosDelViajeActual" :key="b.id">
                <td>#{{ b.asiento }} ({{ b.ubicacionAsiento[0] }})</td>
                <td>{{ b.pasajeroNombre }}</td>
                <td>{{ b.origen }} - {{ b.destino }}</td>
                <td>
                  <button class="btn-mini" @click="boletoParaImprimir = b">Ver Ticket</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>

    <!-- MÓDULO 2: ADMINISTRAR FLOTA -->
    <main v-if="pestanaActiva === 'flota'" class="card no-print">
      <h2>Administración de Flota de Transporte</h2>
      <div class="form-inline">
        <input v-model="nuevoBus.numeroUnidad" placeholder="N° Unidad (Ej. 01)" />
        <input v-model="nuevoBus.placa" placeholder="Placa (Ej. ABC-123)" />
        <input v-model="nuevoBus.modelo" placeholder="Marca / Modelo (Ej. Mercedes-Benz)" />
        <button class="btn-primario" @click="agregarBus">Guardar Bus</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>N° Unidad</th>
            <th>Placa</th>
            <th>Modelo</th>
            <th>Capacidad</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="bus in flota" :key="bus.id">
            <td>{{ bus.numeroUnidad }}</td>
            <td>{{ bus.placa }}</td>
            <td>{{ bus.modelo }}</td>
            <td>39 Asientos</td>
            <td><button class="btn-peligro" @click="eliminarBus(bus.id)">Eliminar</button></td>
          </tr>
        </tbody>
      </table>
    </main>

    <!-- MÓDULO 3: ADMINISTRAR CHOFERES -->
    <main v-if="pestanaActiva === 'choferes'" class="card no-print">
      <h2>Administración de Choferes</h2>
      <div class="form-inline">
        <input v-model="nuevoChofer.nombres" placeholder="Nombres completos" />
        <input v-model="nuevoChofer.dni" placeholder="DNI" />
        <input v-model="nuevoChofer.licencia" placeholder="N° Licencia (A-IIIc)" />
        <input v-model="nuevoChofer.telefono" placeholder="Teléfono" />
        <button class="btn-primario" @click="agregarChofer">Guardar Chofer</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Nombres</th>
            <th>DNI</th>
            <th>Licencia</th>
            <th>Teléfono</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="chofer in choferes" :key="chofer.id">
            <td>{{ chofer.nombres }}</td>
            <td>{{ chofer.dni }}</td>
            <td>{{ chofer.licencia }}</td>
            <td>{{ chofer.telefono }}</td>
            <td><button class="btn-peligro" @click="eliminarChofer(chofer.id)">Eliminar</button></td>
          </tr>
        </tbody>
      </table>
    </main>

    <!-- MODAL / ZONA IMPRIMIBLE DEL BOLETO -->
    <div v-if="boletoParaImprimir" class="modal-overlay">
      <div class="ticket-imprimible">
        <div class="ticket-header">
          <h3>EXPRESO PAUZA - LIMA S.A.C.</h3>
          <p>RUC: 20601234567 | Terminal Terrestre Pauza</p>
          <strong>BOLETO DE VIAJE ELECTRÓNICO</strong>
          <p>N° {{ boletoParaImprimir.codigo }}</p>
        </div>

        <hr />

        <div class="ticket-body">
          <p><strong>Pasajero:</strong> {{ boletoParaImprimir.pasajeroNombre }}</p>
          <p><strong>DNI:</strong> {{ boletoParaImprimir.pasajeroDni }}</p>
          <p><strong>Ruta:</strong> {{ boletoParaImprimir.origen }} ➔ {{ boletoParaImprimir.destino }}</p>
          <p><strong>Fecha de Viaje:</strong> {{ boletoParaImprimir.fecha }}</p>
          <p class="asiento-destacado">
            ASIENTO N° {{ boletoParaImprimir.asiento }} ({{ boletoParaImprimir.ubicacionAsiento }})
          </p>
          <p><strong>Bus:</strong> Unidad {{ boletoParaImprimir.busUnidad }} (Placa: {{ boletoParaImprimir.busPlaca }})</p>
          <p><strong>Chofer:</strong> {{ boletoParaImprimir.choferNombre }}</p>
          <p><strong>Importe Pagado:</strong> S/. {{ Number(boletoParaImprimir.precio).toFixed(2) }}</p>
        </div>

        <hr />
        <small>Emitido: {{ boletoParaImprimir.fechaEmision }}</small>
        <p class="mensaje-pie">Presentarse 30 minutos antes de la salida.</p>

        <div class="ticket-acciones no-print">
          <button class="btn-primario" @click="imprimirTicket">🖨️ Imprimir Boleto</button>
          <button class="btn-secundario" @click="boletoParaImprimir = null">Cerrar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
* { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
body { margin: 0; background: #f1f5f9; color: #1e293b; }
.contenedor { max-width: 1150px; margin: 0 auto; padding: 20px; }

header { background: #0f172a; color: white; padding: 18px 24px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
header h1 { margin: 0; font-size: 1.3rem; }
.menu button { background: #1e293b; color: #cbd5e1; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; margin-left: 8px; font-weight: 600; }
.menu button.activo { background: #2563eb; color: white; }

.grid-ventas { display: grid; grid-template-columns: 360px 1fr; gap: 20px; }
@media (max-width: 850px) { .grid-ventas { grid-template-columns: 1fr; } }

.card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.card h2 { margin-top: 0; font-size: 1.15rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }

/* Croquis del bus */
.leyenda { display: flex; gap: 8px; margin-bottom: 12px; font-size: 0.8rem; }
.badge { padding: 4px 8px; border-radius: 4px; font-weight: 600; }
.badge.libre { background: #dcfce7; color: #166534; }
.badge.seleccionado { background: #2563eb; color: white; }
.badge.ocupado { background: #fee2e2; color: #991b1b; }

.bus-carroceria { border: 3px solid #475569; border-radius: 24px 24px 10px 10px; padding: 14px; background: #f8fafc; }
.cabina { background: #334155; color: white; text-align: center; padding: 8px; border-radius: 12px 12px 4px 4px; margin-bottom: 14px; font-size: 0.85rem; }
.fila-asientos { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 6px; }
.asiento { height: 42px; border: 1px solid #86efac; background: #dcfce7; color: #14532d; border-radius: 6px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.asiento small { font-size: 0.65rem; opacity: 0.8; }
.asiento.seleccionado { background: #2563eb; color: white; border-color: #1d4ed8; }
.asiento.ocupado { background: #fca5a5; color: #7f1d1d; border-color: #f87171; cursor: not-allowed; }
.nota { font-size: 0.85rem; color: #64748b; text-align: center; margin-bottom: 0; }

/* Formularios y Tablas */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
.form-inline { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
label { display: flex; flex-direction: column; font-size: 0.85rem; font-weight: 600; gap: 4px; }
input, select { padding: 9px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.95rem; }

.alerta-asiento { background: #dbeafe; color: #1e40af; padding: 10px; border-radius: 6px; margin-bottom: 14px; text-align: center; }
.alerta-asiento.neutro { background: #f1f5f9; color: #475569; }

.btn-primario { background: #16a34a; color: white; border: none; padding: 12px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; font-size: 1rem; }
.form-inline .btn-primario { width: auto; }
.btn-secundario { background: #64748b; color: white; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; }
.btn-peligro { background: #dc2626; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; }
.btn-mini { background: #2563eb; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }

table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.9rem; }
th, td { border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: left; }
th { background: #f8fafc; }

/* Modal y Ticket de Impresión */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
.ticket-imprimible { background: white; width: 340px; padding: 20px; border-radius: 8px; font-family: 'Courier New', Courier, monospace; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
.ticket-header { text-align: center; }
.ticket-header h3 { margin: 0 0 4px; font-size: 1.05rem; }
.ticket-header p { margin: 2px 0; font-size: 0.8rem; }
.ticket-body p { margin: 6px 0; font-size: 0.9rem; }
.asiento-destacado { font-size: 1.1rem !important; font-weight: bold; border: 1px dashed #000; padding: 6px; text-align: center; margin: 10px 0 !important; }
.mensaje-pie { text-align: center; font-size: 0.8rem; margin-top: 8px; }
.ticket-acciones { display: flex; gap: 10px; margin-top: 16px; }

@media print {
  .no-print { display: none !important; }
  .modal-overlay { position: static; background: none; }
  .ticket-imprimible { box-shadow: none; width: 100%; max-width: 80mm; margin: 0 auto; }
}
</style>