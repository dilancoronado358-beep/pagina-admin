// ============================================================
// CONFIGURACIÓN SUPABASE
// ============================================================
const SUPABASE_URL = 'https://tmucjycefiyhthgoladq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GRERFbwae5xPLjMPG55zXA_Z2GWb3qB';
let sb = null; // cliente Supabase

// ============================================================
// LISTAS ESTÁTICAS DE RESPALDO
// ============================================================
const AREAS_ESTATICAS = [
  'Odontología',
  'Urología',
  'Imagenología',
  'Traumatología',
  'Pediatría',
  'Medicina General',
  'Fisioterapia',
  'Obstetricia',
  'Psicología Clínica',
  'Nutrición',
  'Farmacia'
];

const ENFERMERAS_ESTATICAS = [
  'Lic. Dayana Obando',
  'Lic. Sonia Cangas',
  'Lic. Jessica Muñoz',
  'Lic. Erika Criollo',
  'Lic. Byron Colimba',
  'Tngla. Nicol Landázuri',
  'Lic. Viviana Sánchez'
];

// ============================================================
// ESTADO GLOBAL
// ============================================================
const Estado = {
  role: null,              // 'turnero' | 'enfermera' | 'doctor'
  userName: '',            // Nombre del turnero o enfermera
  areaId: null,            // Área/Especialidad seleccionada por el doctor
  areas: [],
  enfermeras: [],
  contadoresGenerales: 0,  // Contador local para turneros (si offline)
  contadoresAreas: {},     // Contadores locales por área
  online: false,
  autoRefreshInterval: null // ID del setInterval para auto-recarga
};

// ============================================================
// OBJETO PRINCIPAL DE LA APP
// ============================================================
const app = {

  // ------ ARRANQUE ----------------------------------------
  async init() {
    Estado.areas = AREAS_ESTATICAS;
    Estado.enfermeras = ENFERMERAS_ESTATICAS;
    this.llenarSelects();

    try {
      if (!window.supabase) throw new Error('SDK no disponible');
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

      // Verificar conexión
      const { error: testErr } = await sb.from('turnos').select('id').limit(1);
      if (testErr) throw new Error('Supabase no responde: ' + testErr.message);

      Estado.online = true;
      console.log('✅ Supabase en línea');

    } catch (e) {
      Estado.online = false;
      console.warn('⚠️ Modo offline:', e.message);
    }
  },

  // ------ SELECTS -----------------------------------------
  llenarSelects() {
    // Select de áreas para Doctores
    const selDoc = document.getElementById('doctorLoginSelect');
    if (selDoc) {
      selDoc.innerHTML = '<option value="">-- Seleccionar Área --</option>';
      Estado.areas.forEach(a => {
        selDoc.innerHTML += `<option value="${a}">${a}</option>`;
      });
    }

    // Select de áreas para Triaje (Enfermera)
    const selTriajeArea = document.getElementById('triajeEspecialidad');
    if (selTriajeArea) {
      selTriajeArea.innerHTML = '<option value="">-- Seleccionar Área --</option>';
      Estado.areas.forEach(a => {
        selTriajeArea.innerHTML += `<option value="${a}">${a}</option>`;
      });
    }

    // Select de enfermeras
    const selEnf = document.getElementById('enfermeraLoginSelect');
    if (selEnf) {
      selEnf.innerHTML = '<option value="">-- Seleccionar Enfermero/a --</option>';
      Estado.enfermeras.forEach(e => {
        selEnf.innerHTML += `<option value="${e}">${e}</option>`;
      });
    }
  },

  // ------ NAVEGACIÓN MODAL --------------------------------
  selectRole(role) {
    document.querySelectorAll('.login-step').forEach(el => el.classList.remove('active'));
    if (role === 'turnero') {
      document.getElementById('step-turnero').classList.add('active');
      setTimeout(() => { const i = document.getElementById('userNameInput'); if(i) i.focus(); }, 100);
    } else if (role === 'enfermera') {
      document.getElementById('step-enfermera').classList.add('active');
    } else {
      document.getElementById('step-doctor').classList.add('active');
    }
  },

  backToRoles() {
    document.querySelectorAll('.login-step').forEach(el => el.classList.remove('active'));
    document.getElementById('step-role').classList.add('active');
  },

  // ------ LOGIN -------------------------------------------
  async loginTurnero() {
    const nombre = (document.getElementById('userNameInput').value || '').trim();
    if (!nombre) { this.toast('Ingresa tu nombre', 'error'); return; }

    Estado.role = 'turnero';
    Estado.userName = nombre;
    this.cerrarOverlay('📝 Recepción:', nombre);
    this.mostrarVista('darTurno');

    this.cargarHistorialTurnero();
    this.calcularProximoTurnoGeneral();
  },

  async loginEnfermera() {
    const sel = document.getElementById('enfermeraLoginSelect');
    if (!sel.value) { this.toast('Selecciona tu nombre', 'error'); return; }

    Estado.role = 'enfermera';
    Estado.userName = sel.value;
    this.cerrarOverlay('🩺 Triaje:', Estado.userName);
    this.mostrarVista('triaje');

    await this.cargarPacientesTriaje();
    // Auto-recarga cada 30 segundos
    if (Estado.autoRefreshInterval) clearInterval(Estado.autoRefreshInterval);
    Estado.autoRefreshInterval = setInterval(() => { this.cargarPacientesTriaje(); }, 30000);
  },

  async loginDoctor() {
    const sel = document.getElementById('doctorLoginSelect');
    if (!sel.value) { this.toast('Selecciona el área', 'error'); return; }

    Estado.role = 'doctor';
    Estado.areaId = sel.value;
    this.cerrarOverlay('👨‍⚕️ Área:', Estado.areaId);
    
    const titulo = document.getElementById('tituloConsultorio');
    if (titulo) titulo.innerText = 'Próximo Paciente en ' + Estado.areaId;
    
    this.mostrarVista('misPacientes');
    await this.cargarPacientesArea();
    // Auto-recarga cada 30 segundos
    if (Estado.autoRefreshInterval) clearInterval(Estado.autoRefreshInterval);
    Estado.autoRefreshInterval = setInterval(() => { this.cargarPacientesArea(); }, 30000);
  },

  cerrarOverlay(badgeText, userText) {
    document.getElementById('overlay').style.display = 'none';
    const rb = document.getElementById('roleBadge');
    if (rb) rb.innerText = badgeText;
    const dun = document.getElementById('displayUserName');
    if (dun) dun.innerText = userText;
  },

  mostrarVista(vistaId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + vistaId).classList.add('active');
  },

  cerrarSesion() {
    // Detener auto-recarga
    if (Estado.autoRefreshInterval) {
      clearInterval(Estado.autoRefreshInterval);
      Estado.autoRefreshInterval = null;
    }
    Estado.role = null;
    Estado.userName = '';
    Estado.areaId = null;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('overlay').style.display = 'flex';
    this.backToRoles();
    
    // Limpiar campos de login
    document.getElementById('userNameInput').value = '';
    document.getElementById('enfermeraLoginSelect').value = '';
    document.getElementById('doctorLoginSelect').value = '';
  },

  // ============================================================
  // LÓGICA TURNERO (Recepción)
  // ============================================================
  async calcularProximoTurnoGeneral() {
    const numEl = document.getElementById('nextTurnNumber');
    const preview = document.getElementById('turnPreview');
    if (preview) preview.style.display = 'block';
    if (numEl) numEl.innerText = 'Calculando...';

    let ultimo = Estado.contadoresGenerales;

    if (Estado.online && sb) {
      try {
        // Obtenemos el turno más alto general (independiente de especialidad o doctor)
        const { data } = await sb.from('turnos')
          .select('numero_turno')
          .order('id', { ascending: false }) // En turnos generales, nos basamos en el ID que es secuencial
          .limit(1);
          
        if (data && data.length > 0) {
          ultimo = data[0].numero_turno || 0;
        } else {
          ultimo = 0;
        }
        Estado.contadoresGenerales = ultimo;
      } catch(e) {
        console.warn('Error calculando turno general', e);
      }
    }

    if (numEl) numEl.innerText = 'Turno #' + (ultimo + 1);
  },

  async darTurno() {
    const btn = document.getElementById('btnDarTurno');
    btn.disabled = true;
    btn.innerText = 'Registrando...';

    const nombre = document.getElementById('pacienteNameInput').value.trim();
    const cedula = document.getElementById('pacienteCedula').value.trim();
    const celular = document.getElementById('pacienteCelular').value.trim();
    const direccion = document.getElementById('pacienteDireccion').value.trim();

    if (!nombre) {
      this.toast('Ingresa el nombre del paciente', 'error');
      btn.disabled = false;
      btn.innerText = 'Registrar Paciente y Generar Turno';
      return;
    }

    // El turnero empaca solo los datos de contacto y recepción
    const pacienteEmpacado = JSON.stringify({
      nombre: nombre,
      cedula: cedula,
      celular: celular,
      direccion: direccion
    });

    let numeroTurno = Estado.contadoresGenerales + 1;

    try {
      if (Estado.online && sb) {
        // Recalcular en vivo antes de insertar
        const { data: maxTurnoData } = await sb.from('turnos')
          .select('numero_turno')
          .order('id', { ascending: false })
          .limit(1);

        if (maxTurnoData && maxTurnoData.length > 0) {
          numeroTurno = (maxTurnoData[0].numero_turno || 0) + 1;
        } else {
          numeroTurno = 1;
        }

        // Insertar turno (estado inicial: en_espera_triaje)
        // UUID por defecto o se omite si se puede.
        const UUID_TRIAJE = '00000000-0000-0000-0000-000000000000'; // Dejar vacío si doctor_id no es obligatorio en DB
        const { error: insErr } = await sb.from('turnos').insert({
          numero_turno: numeroTurno,
          paciente: pacienteEmpacado,
          estado: 'en_espera_triaje',
          creado_por: Estado.userName,
          doctor_id: null // Si la BD permite nulos. Si lanza error, es porque la BD tiene "not null"
        });

        if (insErr) {
          console.error("Supabase insert error (Turnero):", insErr);
          throw insErr;
        }

        Estado.contadoresGenerales = numeroTurno;
      }
      this.toast('Paciente registrado (Turno #' + numeroTurno + ')', 'success');

      // Limpiar
      document.getElementById('pacienteNameInput').value = '';
      document.getElementById('pacienteCedula').value = '';
      document.getElementById('pacienteCelular').value = '';
      document.getElementById('pacienteDireccion').value = '';

      this.calcularProximoTurnoGeneral();
      this.cargarHistorialTurnero();

    } catch (err) {
      console.error('Error al registrar paciente:', err);
      if (err.message && err.message.includes('doctor_id')) {
        this.toast('Error: BD exige doctor_id. Ajusta Supabase permitiendo nulos.', 'error');
      } else {
        this.toast('Error al registrar: ' + err.message, 'error');
      }
    }

    btn.disabled = false;
    btn.innerText = 'Registrar Paciente y Generar Turno';
  },

  async cargarHistorialTurnero() {
    const lista = document.getElementById('turneroHistoryList');
    if (!lista) return;

    if (Estado.online && sb && Estado.userName) {
      try {
        const { data, error } = await sb.from('turnos')
          .select('numero_turno, paciente, estado, creado_por')
          .eq('creado_por', Estado.userName)
          .order('id', { ascending: false })
          .limit(10);

        if (error) throw error;

        lista.innerHTML = '';
        if (data && data.length > 0) {
          data.forEach(t => {
            let nombreReal = 'Sin nombre';
            try {
              const obj = JSON.parse(t.paciente);
              nombreReal = obj.nombre || 'Desconocido';
            } catch(e) { nombreReal = t.paciente; }

            const li = document.createElement('li');
            li.className = 'patient-item';
            li.innerHTML = `
              <div class="patient-header" style="margin-bottom:0;">
                <div>
                  <div class="patient-title">Turno General #${t.numero_turno} — ${nombreReal}</div>
                  <div class="patient-subtitle">Estado: ${t.estado.replace(/_/g, ' ').toUpperCase()}</div>
                </div>
              </div>
            `;
            lista.appendChild(li);
          });
        } else {
          lista.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;padding:1rem;">No hay pacientes registrados en esta sesión.</li>';
        }
      } catch (err) {
        console.error('Error cargando historial:', err);
      }
    }
  },

  // ============================================================
  // LÓGICA ENFERMERÍA (Triaje)
  // ============================================================
  async cargarPacientesTriaje() {
    const listEl = document.getElementById('triajeList');
    if (!listEl) return;
    listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;">Cargando...</li>';

    if (!Estado.online || !sb) return;

    try {
      const { data, error } = await sb.from('turnos')
        .select('*')
        .eq('estado', 'en_espera_triaje')
        .order('id', { ascending: true }); // Orden de llegada

      if (error) throw error;

      listEl.innerHTML = '';

      if (!data || data.length === 0) {
        listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;">No hay pacientes esperando triaje.</li>';
        document.getElementById('currentTriajeNumber').innerText = '--';
        document.getElementById('currentTriajeName').innerText = 'Recepción vacía';
        return;
      }

      const proximo = data[0];
      let proxNombre = proximo.paciente;
      try { proxNombre = JSON.parse(proximo.paciente).nombre; } catch(e){}

      document.getElementById('currentTriajeNumber').innerText = 'Turno #' + proximo.numero_turno;
      document.getElementById('currentTriajeName').innerText = proxNombre;

      data.forEach(t => {
        let pData = {};
        try { pData = JSON.parse(t.paciente); } catch(e) { pData.nombre = t.paciente; }

        listEl.innerHTML += `
          <li class="patient-item">
            <div class="patient-header" style="margin-bottom:0;">
              <div>
                <div class="patient-title">Turno #${t.numero_turno} — ${pData.nombre || 'Sin nombre'}</div>
                <div class="patient-subtitle">Cédula: ${pData.cedula || 'N/A'} | Creado por: ${t.creado_por || 'N/A'}</div>
              </div>
              <div class="patient-actions">
                <button class="btn-action btn-call" onclick="app.abrirFormularioTriaje('${t.id}')">🩺 Tomar Signos</button>
              </div>
            </div>
          </li>`;
      });

    } catch(e) {
      console.error('Error cargando triaje:', e);
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:red;">Error cargando pacientes</li>';
    }
  },

  async abrirFormularioTriaje(turnoId) {
    try {
      const { data, error } = await sb.from('turnos').select('*').eq('id', turnoId).single();
      if (error) throw error;

      let pData = {};
      try { pData = JSON.parse(data.paciente); } catch(e) { pData.nombre = data.paciente; }

      document.getElementById('triajeTurnoId').value = data.id;
      document.getElementById('triajePacienteName').innerText = 'Paciente: ' + (pData.nombre || 'Desconocido');

      // Limpiar campos
      ['triajeEdad', 'triajePeso', 'triajeEstatura', 'triajePresion', 'triajeTemperatura', 'triajeFrecuencia', 'triajeSaturacion', 'triajeEspecialidad'].forEach(id => {
        document.getElementById(id).value = '';
      });

      // Guardar datos base en un atributo oculto para no perderlos al sobreescribir el JSON
      document.getElementById('triajeTurnoId').dataset.baseJson = JSON.stringify(pData);

      this.mostrarVista('formTriaje');
    } catch(e) {
      this.toast('Error abriendo turno', 'error');
    }
  },

  async guardarTriaje() {
    const turnoId = document.getElementById('triajeTurnoId').value;
    const especialidad = document.getElementById('triajeEspecialidad').value;
    
    if (!especialidad) {
      this.toast('Debes seleccionar el Área / Especialidad', 'error');
      return;
    }

    const btn = document.getElementById('btnGuardarTriaje');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    // Recuperar datos base (nombre, cedula, etc)
    let pData = {};
    try {
      pData = JSON.parse(document.getElementById('triajeTurnoId').dataset.baseJson);
    } catch(e) {}

    // Añadir signos vitales
    pData.edad = document.getElementById('triajeEdad').value;
    pData.peso = document.getElementById('triajePeso').value;
    pData.estatura = document.getElementById('triajeEstatura').value;
    pData.presion = document.getElementById('triajePresion').value;
    pData.temperatura = document.getElementById('triajeTemperatura').value;
    pData.frecuencia = document.getElementById('triajeFrecuencia').value;
    pData.saturacion = document.getElementById('triajeSaturacion').value;

    const pacienteEmpacado = JSON.stringify(pData);

    try {
      // Calcular el Turno de Área
      let numTurnoArea = 1;
      const { data: maxArea } = await sb.from('turnos')
        .select('numero_turno_area')
        .eq('especialidad', especialidad)
        .order('id', { ascending: false })
        .limit(1);

      if (maxArea && maxArea.length > 0 && maxArea[0].numero_turno_area) {
        numTurnoArea = maxArea[0].numero_turno_area + 1;
      }

      // Actualizar turno
      const { error } = await sb.from('turnos')
        .update({
          paciente: pacienteEmpacado,
          estado: 'pendiente',
          especialidad: especialidad,
          numero_turno_area: numTurnoArea
        })
        .eq('id', turnoId);

      if (error) {
        console.error("Error update triaje:", error);
        throw error;
      }

      this.toast('Signos vitales guardados y derivado a ' + especialidad, 'success');
      this.mostrarVista('triaje');
      this.cargarPacientesTriaje();

    } catch(e) {
      console.error(e);
      if (e.message && e.message.includes('column')) {
         this.toast('Faltan columnas en BD (especialidad, numero_turno_area). Aplica el SQL.', 'error');
      } else {
         this.toast('Error al guardar signos', 'error');
      }
    }

    btn.disabled = false;
    btn.innerText = 'Guardar Signos Vitales y Enviar a Consultorio';
  },

  // ============================================================
  // LÓGICA DOCTOR (Especialidad / Área)
  // ============================================================
  async cargarPacientesArea() {
    const listEl = document.getElementById('patientList');
    if (!listEl) return;
    listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;">Cargando...</li>';

    if (!Estado.online || !sb || !Estado.areaId) return;

    try {
      // Buscar pacientes derivados a esta área que estén pendientes o en consulta
      const { data: turnos, error } = await sb.from('turnos')
        .select('*')
        .eq('especialidad', Estado.areaId)
        .in('estado', ['pendiente', 'en_consulta'])
        .order('numero_turno_area', { ascending: true }); // Orden por el turno de área

      if (error) throw error;

      listEl.innerHTML = '';

      const numEl = document.getElementById('currentPatientNumber');
      const nameEl = document.getElementById('currentPatientName');

      if (!turnos || turnos.length === 0) {
        listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;">No hay pacientes en espera en esta área.</li>';
        if (numEl)  numEl.innerText = '--';
        if (nameEl) nameEl.innerText = 'Sala de espera vacía';
        return;
      }

      const enConsulta = turnos.find(t => t.estado === 'en_consulta');
      const proximo = enConsulta || turnos[0];
      
      let proxNombre = proximo.paciente;
      try { proxNombre = JSON.parse(proximo.paciente).nombre; } catch(e){}

      if (numEl)  numEl.innerText = 'Turno #' + (proximo.numero_turno_area || proximo.numero_turno);
      if (nameEl) {
        nameEl.innerText = proxNombre || 'Sin nombre';
        if (enConsulta) {
          nameEl.innerHTML += '<br><span style="font-size:.8rem;background:white;color:var(--primary);padding:2px 10px;border-radius:12px;font-weight:bold;display:inline-block;margin-top:5px;">EN CONSULTA</span>';
        }
      }

      turnos.forEach(t => {
        const ec = t.estado === 'en_consulta';
        let btns = '';
        if (t.estado === 'pendiente')    btns = `<button class="btn-action btn-call" onclick="app.cambiarEstado('${t.id}','en_consulta')">📢 Llamar</button>`;
        if (t.estado === 'en_consulta')  btns = `<button class="btn-action btn-done" onclick="app.cambiarEstado('${t.id}','atendido')">✅ Finalizar</button>`;

        let pData = {};
        try { pData = JSON.parse(t.paciente); } catch(e) { pData.nombre = t.paciente; }

        const numMostrar = t.numero_turno_area || t.numero_turno;

        listEl.innerHTML += `
          <li class="patient-item ${ec ? 'en-consulta' : ''}">
            <div class="patient-header">
              <div>
                <div class="patient-title">Turno Área #${numMostrar} — ${pData.nombre || 'Sin nombre'}</div>
                <div class="patient-subtitle">Recepcionado por: ${t.creado_por || 'N/A'}</div>
              </div>
              <div class="patient-actions">${btns}</div>
            </div>
            <div class="patient-data-grid">
              <div class="data-item"><span>Cédula</span><span>${pData.cedula || 'N/A'}</span></div>
              <div class="data-item"><span>Edad</span><span>${pData.edad ? pData.edad + ' años' : 'N/A'}</span></div>
              <div class="data-item"><span>Peso</span><span>${pData.peso || 'N/A'}</span></div>
              <div class="data-item"><span>Estatura</span><span>${pData.estatura || 'N/A'}</span></div>
              <div class="data-item"><span>Presión Arterial</span><span>${pData.presion || 'N/A'}</span></div>
              <div class="data-item"><span>Temperatura</span><span>${pData.temperatura || 'N/A'}</span></div>
              <div class="data-item"><span>Frec. Cardíaca</span><span>${pData.frecuencia || 'N/A'}</span></div>
              <div class="data-item"><span>Saturación O₂</span><span>${pData.saturacion || 'N/A'}</span></div>
              <div class="data-item"><span>Celular</span><span>${pData.celular || 'N/A'}</span></div>
              <div class="data-item"><span>Dirección</span><span>${pData.direccion || 'N/A'}</span></div>
            </div>
          </li>`;
      });
    } catch(e) {
      console.error(e);
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:red;">Error cargando pacientes del área.</li>';
    }
  },

  async cambiarEstado(turnoId, nuevoEstado) {
    if (Estado.online && sb) {
      try {
        const { error } = await sb.from('turnos')
          .update({ estado: nuevoEstado }).eq('id', turnoId);
        if (error) throw error;
      } catch (e) {
        console.error('Error actualizando estado:', e);
        this.toast('Error al actualizar', 'error');
        return;
      }
    }

    if (nuevoEstado === 'en_consulta') this.toast('Paciente llamado', 'success');
    if (nuevoEstado === 'atendido')    this.toast('Consulta finalizada', 'success');

    await this.cargarPacientesArea();
  },

  // ============================================================
  // TOAST
  // ============================================================
  toast(msg, tipo) {
    tipo = tipo || 'success';
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast ' + tipo;
    t.innerText = msg;
    c.appendChild(t);
    setTimeout(() => { if (c.contains(t)) c.removeChild(t); }, 3500);
  }
};

// ============================================================
// ARRANQUE (sin DOMContentLoaded para evitar problemas de timing)
// ============================================================
function arrancarApp() {
  app.init();

  // Botones del modal
  const bDoc = document.getElementById('btnRoleDoctor');
  if (bDoc) bDoc.onclick = function() { app.selectRole('doctor'); };

  const bEnf = document.getElementById('btnRoleEnfermera');
  if (bEnf) bEnf.onclick = function() { app.selectRole('enfermera'); };

  const bTur = document.getElementById('btnRoleTurnero');
  if (bTur) bTur.onclick = function() { app.selectRole('turnero'); };

  const bIngTur = document.getElementById('btnIngresarTurnero');
  if (bIngTur) bIngTur.onclick = function() { app.loginTurnero(); };

  const bIngEnf = document.getElementById('btnIngresarEnfermera');
  if (bIngEnf) bIngEnf.onclick = function() { app.loginEnfermera(); };

  const bIngDoc = document.getElementById('btnIngresarDoctor');
  if (bIngDoc) bIngDoc.onclick = function() { app.loginDoctor(); };

  // Enter en el campo de nombre
  const inp = document.getElementById('userNameInput');
  if (inp) inp.onkeypress = function(e) { if (e.key === 'Enter') app.loginTurnero(); };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', arrancarApp);
} else {
  arrancarApp();
}

window.app = app;
