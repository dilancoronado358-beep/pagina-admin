// ============================================================
// CONFIGURACIÓN SUPABASE
// ============================================================
const SUPABASE_URL = 'https://tmucjycefiyhthgoladq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GRERFbwae5xPLjMPG55zXA_Z2GWb3qB';
let sb = null;

// ============================================================
// LISTAS ESTÁTICAS
// ============================================================
const AREAS_ESTATICAS = [
  'Medicina General',
  'Odontología',
  'Pediatría',
  'Obstetricia',
  'Traumatología',
  'Fisioterapia',
  'Psicología Clínica',
  'Nutrición',
  'Urología',
  'Imagenología',
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
  role: null,           // 'turnero' | 'enfermera' | 'doctor'
  userName: '',
  areaId: null,         // Área seleccionada por el doctor
  areas: [],
  enfermeras: [],
  online: false,
  autoRefreshInterval: null
};

// ============================================================
// APP
// ============================================================
const app = {

  // ---- ARRANQUE ----
  async init() {
    Estado.areas     = AREAS_ESTATICAS;
    Estado.enfermeras = ENFERMERAS_ESTATICAS;
    this.llenarSelects();

    try {
      if (!window.supabase) throw new Error('SDK no disponible');
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      const { error } = await sb.from('pacientes_espera').select('id').limit(1);
      if (error) throw error;
      Estado.online = true;
      console.log('✅ Supabase en línea');
    } catch (e) {
      Estado.online = false;
      console.warn('⚠️ Modo offline / tabla no lista:', e.message);
    }
  },

  llenarSelects() {
    // Áreas para login de doctores
    const selDoc = document.getElementById('doctorLoginSelect');
    if (selDoc) {
      selDoc.innerHTML = '<option value="">-- Seleccionar Área --</option>';
      Estado.areas.forEach(a => {
        selDoc.innerHTML += `<option value="${a}">${a}</option>`;
      });
    }
    // Áreas para que la enfermera asigne al triaje
    const selArea = document.getElementById('triajeEspecialidad');
    if (selArea) {
      selArea.innerHTML = '<option value="">-- Seleccionar Área --</option>';
      Estado.areas.forEach(a => {
        selArea.innerHTML += `<option value="${a}">${a}</option>`;
      });
    }
    // Enfermeras
    const selEnf = document.getElementById('enfermeraLoginSelect');
    if (selEnf) {
      selEnf.innerHTML = '<option value="">-- Seleccionar Enfermero/a --</option>';
      Estado.enfermeras.forEach(e => {
        selEnf.innerHTML += `<option value="${e}">${e}</option>`;
      });
    }
  },

  // ---- NAVEGACIÓN ----
  selectRole(role) {
    document.querySelectorAll('.login-step').forEach(el => el.classList.remove('active'));
    if (role === 'turnero') {
      document.getElementById('step-turnero').classList.add('active');
      setTimeout(() => { document.getElementById('userNameInput')?.focus(); }, 100);
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

  mostrarVista(vistaId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + vistaId);
    if (el) el.classList.add('active');
  },

  cerrarOverlay(badge, nombre) {
    document.getElementById('overlay').style.display = 'none';
    const rb = document.getElementById('roleBadge');
    const dn = document.getElementById('displayUserName');
    if (rb) rb.innerText = badge;
    if (dn) dn.innerText = nombre;
  },

  // ---- CERRAR SESIÓN ----
  cerrarSesion() {
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
    document.getElementById('userNameInput').value = '';
    document.getElementById('enfermeraLoginSelect').value = '';
    document.getElementById('doctorLoginSelect').value = '';
  },

  // ============================================================
  // ROL: TURNERO (solo registra datos básicos, SIN número de turno)
  // ============================================================
  async loginTurnero() {
    const nombre = (document.getElementById('userNameInput').value || '').trim();
    if (!nombre) { this.toast('Ingresa tu nombre', 'error'); return; }
    Estado.role     = 'turnero';
    Estado.userName = nombre;
    this.cerrarOverlay('📝', nombre);
    this.mostrarVista('darTurno');
    this.cargarHistorialTurnero();
  },

  async darTurno() {
    const btn = document.getElementById('btnDarTurno');
    btn.disabled = true;
    btn.innerText = 'Registrando...';

    const nombre    = document.getElementById('pacienteNameInput').value.trim();
    const cedula    = document.getElementById('pacienteCedula').value.trim();
    const celular   = document.getElementById('pacienteCelular').value.trim();
    const direccion = document.getElementById('pacienteDireccion').value.trim();

    if (!nombre) {
      this.toast('Ingresa el nombre del paciente', 'error');
      btn.disabled = false;
      btn.innerText = 'Registrar Paciente';
      return;
    }

    try {
      if (Estado.online && sb) {
        const { error } = await sb.from('pacientes_espera').insert({
          nombre:     nombre,
          cedula:     cedula,
          celular:    celular,
          direccion:  direccion,
          creado_por: Estado.userName,
          estado:     'en_espera'   // Aún sin número de turno ni especialidad
        });
        if (error) throw error;
      }

      this.toast(`✅ Paciente "${nombre}" registrado`, 'success');
      document.getElementById('pacienteNameInput').value = '';
      document.getElementById('pacienteCedula').value    = '';
      document.getElementById('pacienteCelular').value   = '';
      document.getElementById('pacienteDireccion').value = '';
      this.cargarHistorialTurnero();

    } catch (err) {
      console.error(err);
      this.toast('Error al registrar: ' + err.message, 'error');
    }

    btn.disabled = false;
    btn.innerText = 'Registrar Paciente';
  },

  async cargarHistorialTurnero() {
    const lista = document.getElementById('turneroHistoryList');
    if (!lista) return;
    if (!Estado.online || !sb) return;

    try {
      const { data, error } = await sb.from('pacientes_espera')
        .select('nombre, cedula, estado, especialidad, numero_turno_area, creado_por')
        .eq('creado_por', Estado.userName)
        .order('id', { ascending: false })
        .limit(15);
      if (error) throw error;

      lista.innerHTML = '';
      if (!data || data.length === 0) {
        lista.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;padding:1rem;">No has registrado pacientes aún.</li>';
        return;
      }

      data.forEach(t => {
        const turnoLabel = t.numero_turno_area
          ? `<span style="background:var(--primary);color:white;padding:2px 10px;border-radius:20px;font-size:.8rem;font-weight:700;">Turno ${t.especialidad ? t.especialidad.substring(0,3).toUpperCase() : ''}-${t.numero_turno_area}</span>`
          : `<span style="background:#e2e8f0;color:#64748b;padding:2px 10px;border-radius:20px;font-size:.8rem;">En Recepción</span>`;

        lista.innerHTML += `
          <li class="patient-item">
            <div class="patient-header" style="margin-bottom:0;">
              <div>
                <div class="patient-title">${t.nombre}</div>
                <div class="patient-subtitle">Cédula: ${t.cedula || 'N/A'} ${t.especialidad ? '→ ' + t.especialidad : ''}</div>
              </div>
              <div>${turnoLabel}</div>
            </div>
          </li>`;
      });
    } catch (err) {
      console.error('Error historial turnero:', err);
    }
  },

  // ============================================================
  // ROL: ENFERMERA (ve TODOS los pacientes, asigna signos y turno)
  // ============================================================
  async loginEnfermera() {
    const sel = document.getElementById('enfermeraLoginSelect');
    if (!sel.value) { this.toast('Selecciona tu nombre', 'error'); return; }
    Estado.role     = 'enfermera';
    Estado.userName = sel.value;
    this.cerrarOverlay('🩺', Estado.userName);
    this.mostrarVista('triaje');
    await this.cargarPacientesTriaje();
    if (Estado.autoRefreshInterval) clearInterval(Estado.autoRefreshInterval);
    Estado.autoRefreshInterval = setInterval(() => this.cargarPacientesTriaje(), 30000);
  },

  async cargarPacientesTriaje() {
    const listEl = document.getElementById('triajeList');
    if (!listEl) return;
    listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;">Cargando...</li>';
    if (!Estado.online || !sb) {
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:orange;">Sin conexión a Supabase.</li>';
      return;
    }

    try {
      // La enfermera ve TODOS los que están "en_espera" (sin turno asignado aún)
      const { data, error } = await sb.from('pacientes_espera')
        .select('*')
        .eq('estado', 'en_espera')
        .order('id', { ascending: true });
      if (error) throw error;

      listEl.innerHTML = '';
      const numEl  = document.getElementById('currentTriajeNumber');
      const nameEl = document.getElementById('currentTriajeName');

      if (!data || data.length === 0) {
        listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;padding:1rem;">No hay pacientes en recepción.</li>';
        if (numEl)  numEl.innerText = '--';
        if (nameEl) nameEl.innerText = 'Sin pacientes en espera';
        return;
      }

      if (numEl)  numEl.innerText = data.length + ' en espera';
      if (nameEl) nameEl.innerText = 'Próximo: ' + data[0].nombre;

      data.forEach(t => {
        listEl.innerHTML += `
          <li class="patient-item">
            <div class="patient-header" style="margin-bottom:0;">
              <div>
                <div class="patient-title">${t.nombre}</div>
                <div class="patient-subtitle">Cédula: ${t.cedula || 'N/A'} | Tel: ${t.celular || 'N/A'}</div>
                <div class="patient-subtitle">Dirección: ${t.direccion || 'N/A'}</div>
              </div>
              <div class="patient-actions">
                <button class="btn-action btn-call" onclick="app.abrirFormularioTriaje('${t.id}', '${(t.nombre || '').replace(/'/g, "\\'")}')">
                  🩺 Tomar Signos y Asignar Turno
                </button>
              </div>
            </div>
          </li>`;
      });
    } catch (e) {
      console.error(e);
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:red;">Error: ' + e.message + '</li>';
    }
  },

  abrirFormularioTriaje(pacienteId, nombrePaciente) {
    document.getElementById('triajeTurnoId').value             = pacienteId;
    document.getElementById('triajePacienteName').innerText    = 'Paciente: ' + nombrePaciente;
    ['triajeEdad','triajePeso','triajeEstatura','triajePresion',
     'triajeTemperatura','triajeFrecuencia','triajeSaturacion','triajeEspecialidad'
    ].forEach(id => { document.getElementById(id).value = ''; });
    this.mostrarVista('formTriaje');
  },

  async guardarTriaje() {
    const pacienteId  = document.getElementById('triajeTurnoId').value;
    const especialidad = document.getElementById('triajeEspecialidad').value;

    if (!especialidad) {
      this.toast('Selecciona el Área/Especialidad', 'error');
      return;
    }

    const btn = document.getElementById('btnGuardarTriaje');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const signosVitales = {
      edad:        document.getElementById('triajeEdad').value,
      peso:        document.getElementById('triajePeso').value,
      estatura:    document.getElementById('triajeEstatura').value,
      presion:     document.getElementById('triajePresion').value,
      temperatura: document.getElementById('triajeTemperatura').value,
      frecuencia:  document.getElementById('triajeFrecuencia').value,
      saturacion:  document.getElementById('triajeSaturacion').value
    };

    try {
      // Calcular el siguiente número de turno para esta especialidad
      const { data: maxData } = await sb.from('pacientes_espera')
        .select('numero_turno_area')
        .eq('especialidad', especialidad)
        .order('numero_turno_area', { ascending: false })
        .limit(1);

      let numTurno = 1;
      if (maxData && maxData.length > 0 && maxData[0].numero_turno_area) {
        numTurno = maxData[0].numero_turno_area + 1;
      }

      // Actualizar el registro del paciente con signos vitales y turno asignado
      const { error } = await sb.from('pacientes_espera')
        .update({
          especialidad:       especialidad,
          numero_turno_area:  numTurno,
          estado:             'pendiente',     // Ahora sí tiene turno y va al doctor
          atendido_por:       Estado.userName, // Nombre de la enfermera
          signos_vitales:     JSON.stringify(signosVitales)
        })
        .eq('id', pacienteId);

      if (error) throw error;

      this.toast(`Turno asignado: ${especialidad.substring(0,3).toUpperCase()}-${numTurno}`, 'success');
      this.mostrarVista('triaje');
      this.cargarPacientesTriaje();

    } catch (e) {
      console.error(e);
      this.toast('Error al guardar: ' + e.message, 'error');
    }

    btn.disabled = false;
    btn.innerText = 'Guardar Signos Vitales y Enviar a Consultorio';
  },

  // ============================================================
  // ROL: DOCTOR / ÁREA (ve solo su cola con turnos asignados)
  // ============================================================
  async loginDoctor() {
    const sel = document.getElementById('doctorLoginSelect');
    if (!sel.value) { this.toast('Selecciona el área', 'error'); return; }
    Estado.role   = 'doctor';
    Estado.areaId = sel.value;
    this.cerrarOverlay('👨‍⚕️', Estado.areaId);
    const titulo = document.getElementById('tituloConsultorio');
    if (titulo) titulo.innerText = 'Área: ' + Estado.areaId;
    this.mostrarVista('misPacientes');
    await this.cargarPacientesArea();
    if (Estado.autoRefreshInterval) clearInterval(Estado.autoRefreshInterval);
    Estado.autoRefreshInterval = setInterval(() => this.cargarPacientesArea(), 30000);
  },

  async cargarPacientesArea() {
    const listEl = document.getElementById('patientList');
    if (!listEl) return;
    listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;">Cargando...</li>';
    if (!Estado.online || !sb) return;

    try {
      const { data: turnos, error } = await sb.from('pacientes_espera')
        .select('*')
        .eq('especialidad', Estado.areaId)
        .in('estado', ['pendiente', 'en_consulta'])
        .order('numero_turno_area', { ascending: true });

      if (error) throw error;

      listEl.innerHTML = '';
      const numEl  = document.getElementById('currentPatientNumber');
      const nameEl = document.getElementById('currentPatientName');

      if (!turnos || turnos.length === 0) {
        listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;padding:1rem;">No hay pacientes en cola para esta área.</li>';
        if (numEl)  numEl.innerText = '--';
        if (nameEl) nameEl.innerText = 'Cola vacía';
        return;
      }

      const enConsulta = turnos.find(t => t.estado === 'en_consulta');
      const proximo    = enConsulta || turnos[0];

      if (numEl)  numEl.innerText = Estado.areaId.substring(0,3).toUpperCase() + '-' + proximo.numero_turno_area;
      if (nameEl) {
        nameEl.innerText = proximo.nombre;
        if (enConsulta) nameEl.innerHTML += '<br><span style="font-size:.8rem;background:rgba(255,255,255,.25);padding:2px 10px;border-radius:12px;display:inline-block;margin-top:6px;">EN CONSULTA</span>';
      }

      turnos.forEach(t => {
        const ec   = t.estado === 'en_consulta';
        let btns   = '';
        if (t.estado === 'pendiente')   btns = `<button class="btn-action btn-call" onclick="app.cambiarEstado('${t.id}','en_consulta')">📢 Llamar</button>`;
        if (t.estado === 'en_consulta') btns = `<button class="btn-action btn-done" onclick="app.cambiarEstado('${t.id}','atendido')">✅ Finalizar</button>`;

        let sv = {};
        try { sv = JSON.parse(t.signos_vitales || '{}'); } catch(e) {}

        listEl.innerHTML += `
          <li class="patient-item ${ec ? 'en-consulta' : ''}">
            <div class="patient-header">
              <div>
                <div class="patient-title">Turno ${Estado.areaId.substring(0,3).toUpperCase()}-${t.numero_turno_area} — ${t.nombre}</div>
                <div class="patient-subtitle">Cédula: ${t.cedula || 'N/A'} | Tel: ${t.celular || 'N/A'} | Triaje: ${t.atendido_por || 'N/A'}</div>
              </div>
              <div class="patient-actions">${btns}</div>
            </div>
            <div class="patient-data-grid">
              <div class="data-item"><span>Dirección</span><span>${t.direccion || 'N/A'}</span></div>
              <div class="data-item"><span>Edad</span><span>${sv.edad ? sv.edad + ' años' : 'N/A'}</span></div>
              <div class="data-item"><span>Peso</span><span>${sv.peso || 'N/A'}</span></div>
              <div class="data-item"><span>Estatura</span><span>${sv.estatura || 'N/A'}</span></div>
              <div class="data-item"><span>Presión</span><span>${sv.presion || 'N/A'}</span></div>
              <div class="data-item"><span>Temperatura</span><span>${sv.temperatura || 'N/A'}</span></div>
              <div class="data-item"><span>Frec. Cardíaca</span><span>${sv.frecuencia || 'N/A'}</span></div>
              <div class="data-item"><span>Saturación O₂</span><span>${sv.saturacion || 'N/A'}</span></div>
            </div>
          </li>`;
      });
    } catch (e) {
      console.error(e);
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:red;">Error: ' + e.message + '</li>';
    }
  },

  async cambiarEstado(pacienteId, nuevoEstado) {
    if (!Estado.online || !sb) return;
    try {
      const { error } = await sb.from('pacientes_espera')
        .update({ estado: nuevoEstado })
        .eq('id', pacienteId);
      if (error) throw error;
    } catch (e) {
      this.toast('Error al actualizar estado', 'error');
      return;
    }
    if (nuevoEstado === 'en_consulta') this.toast('Paciente llamado', 'success');
    if (nuevoEstado === 'atendido')    this.toast('Consulta finalizada ✅', 'success');
    await this.cargarPacientesArea();
  },

  // ---- TOAST ----
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
// ARRANQUE
// ============================================================
function arrancarApp() {
  app.init();

  document.getElementById('btnRoleDoctor')?.addEventListener('click', () => app.selectRole('doctor'));
  document.getElementById('btnRoleEnfermera')?.addEventListener('click', () => app.selectRole('enfermera'));
  document.getElementById('btnRoleTurnero')?.addEventListener('click', () => app.selectRole('turnero'));

  document.getElementById('btnIngresarTurnero')?.addEventListener('click', () => app.loginTurnero());
  document.getElementById('btnIngresarEnfermera')?.addEventListener('click', () => app.loginEnfermera());
  document.getElementById('btnIngresarDoctor')?.addEventListener('click', () => app.loginDoctor());

  document.getElementById('userNameInput')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') app.loginTurnero();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', arrancarApp);
} else {
  arrancarApp();
}

window.app = app;
