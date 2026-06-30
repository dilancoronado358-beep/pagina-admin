// ============================================================
// CONFIGURACIÓN SUPABASE
// ============================================================
const SUPABASE_URL = 'https://tmucjycefiyhthgoladq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GRERFbwae5xPLjMPG55zXA_Z2GWb3qB';
let sb = null;

// ============================================================
// LISTAS ESTÁTICAS
// ============================================================
// Áreas reales del sistema (usadas para asignar doctores y filtrar colas)
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
  'Farmacia',
  'Corte de Cabello'
];

// Opciones que ve el Turnero al registrar al paciente.
// Algunas son alias que se redirigen a un área real con una nota de motivo.
const OPCIONES_ESPECIALIDAD = [
  { label: 'Medicina General', area: 'Medicina General', motivo: null },
  { label: 'Odontología', area: 'Odontología', motivo: null },
  { label: 'Pediatría', area: 'Pediatría', motivo: null },
  { label: 'Obstetricia', area: 'Obstetricia', motivo: null },
  { label: 'Solo Papanicolau', area: 'Obstetricia', motivo: 'Solo Papanicolau — Sin revisión general' },
  { label: 'Traumatología', area: 'Traumatología', motivo: null },
  { label: 'Fisioterapia', area: 'Fisioterapia', motivo: null },
  { label: 'Psicología Clínica', area: 'Psicología Clínica', motivo: null },
  { label: 'Nutrición', area: 'Nutrición', motivo: null },
  { label: 'Urología', area: 'Urología', motivo: null },
  { label: 'Imagenología', area: 'Imagenología', motivo: null },
  { label: 'Farmacia', area: 'Farmacia', motivo: null },
  { label: 'Corte de Cabello', area: 'Corte de Cabello', motivo: null }
];



// ============================================================
// ESTADO GLOBAL
// ============================================================
const Estado = {
  role: null,           // 'turnero' | 'enfermera' | 'doctor' | 'admin'
  userName: '',
  adminPass: '',        // Se guarda temporalmente para las llamadas a RPC de admin
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
    Estado.areas = AREAS_ESTATICAS;
    this.llenarSelects();

    try {
      if (!window.supabase) throw new Error('SDK no disponible');
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      const { error } = await sb.from('pacientes_espera').select('id').limit(1);
      if (error) throw error;
      Estado.online = true;
      console.log('✅ Supabase en línea');
      this.verificarSesionGuardada();
    } catch (e) {
      Estado.online = false;
      console.warn('⚠️ Modo offline / tabla no lista:', e.message);
    }
  },

  llenarSelects() {
    // Opciones para el Turnero (incluye alias como Solo Papanicolau)
    const selPac = document.getElementById('pacienteEspecialidad');
    if (selPac) {
      selPac.innerHTML = '<option value="">-- Seleccionar Área / Servicio --</option>';
      OPCIONES_ESPECIALIDAD.forEach(op => {
        selPac.innerHTML += `<option value="${op.label}">${op.label}${op.motivo ? ' 📋' : ''}</option>`;
      });
    }
    // Áreas reales para el admin (doctores se asignan a áreas reales)
    const selAdmin = document.getElementById('adminNewArea');
    if (selAdmin) {
      selAdmin.innerHTML = '<option value="">-- Sin Área --</option>';
      Estado.areas.forEach(a => { selAdmin.innerHTML += `<option value="${a}">${a}</option>`; });
    }
  },

  verificarSesionGuardada() {
    const sesionInfo = localStorage.getItem('turnero_session');
    if (sesionInfo) {
      try {
        const parsed = JSON.parse(sesionInfo);
        Estado.role = parsed.role;
        Estado.userName = parsed.userName;
        Estado.areaId = parsed.areaId;
        Estado.adminPass = parsed.adminPass || '';
        this.restaurarVistaSegunRol();
      } catch (e) {
        console.error('Error parseando sesión', e);
      }
    }
  },

  async restaurarVistaSegunRol() {
    if (Estado.role === 'admin') {
      this.cerrarOverlay('👑', 'Administrador');
      this.mostrarVista('admin');
      this.adminCargarUsuarios();
    } else if (Estado.role === 'turnero') {
      this.cerrarOverlay('📝', Estado.userName);
      this.mostrarVista('darTurno');
      this.cargarHistorialTurnero();
    } else if (Estado.role === 'enfermera') {
      this.cerrarOverlay('🩺', Estado.userName);
      this.mostrarVista('triaje');
      this.cargarPacientesTriaje();
      if (Estado.autoRefreshInterval) clearInterval(Estado.autoRefreshInterval);
      Estado.autoRefreshInterval = setInterval(() => this.cargarPacientesTriaje(), 5000);
    } else if (Estado.role === 'doctor') {
      if (!Estado.areaId) return; // Error preventivo
      this.cerrarOverlay('👨‍⚕️', Estado.areaId);
      const titulo = document.getElementById('tituloConsultorio');
      if (titulo) titulo.innerText = 'Área: ' + Estado.areaId;
      this.mostrarVista('misPacientes');
      await this.cargarPacientesArea();
      if (Estado.autoRefreshInterval) clearInterval(Estado.autoRefreshInterval);
      Estado.autoRefreshInterval = setInterval(() => this.cargarPacientesArea(), 5000);
    }
  },

  // ---- NAVEGACIÓN ----

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
    Estado.adminPass = '';
    localStorage.removeItem('turnero_session');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('overlay').style.display = 'flex';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
  },

  // ============================================================
  // ROL: TURNERO (solo registra datos básicos, SIN número de turno)
  // ============================================================
  async iniciarSesion() {
    const user = (document.getElementById('loginUsername').value || '').trim();
    const pass = (document.getElementById('loginPassword').value || '').trim();

    if (!user || !pass) {
      this.toast('Ingresa usuario y contraseña', 'error');
      return;
    }

    const btn = document.getElementById('btnIngresar');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Verificando...';

    try {
      if (!Estado.online || !sb) throw new Error('Sin conexión a Base de Datos');

      const { data, error } = await sb.rpc('verificar_login', {
        p_username: user,
        p_password: pass
      });

      if (error) throw error;

      if (!data || !data.success) {
        throw new Error(data?.message || 'Credenciales incorrectas');
      }

      Estado.role = data.role;
      Estado.userName = data.username;
      Estado.areaId = data.area || null;
      if (Estado.role === 'admin') Estado.adminPass = pass;

      localStorage.setItem('turnero_session', JSON.stringify({
        role: Estado.role,
        userName: Estado.userName,
        areaId: Estado.areaId,
        adminPass: Estado.adminPass
      }));

      this.restaurarVistaSegunRol();

    } catch (e) {
      console.error(e);
      this.toast(e.message, 'error');
    }

    btn.disabled = false;
    btn.innerText = originalText;
  },

  async darTurno(directoEspecialidad = false) {
    const btn = document.getElementById(directoEspecialidad ? 'btnDarTurnoDirecto' : 'btnDarTurno');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Registrando...';

    const nombre = document.getElementById('pacienteNameInput').value.trim();
    const cedula = document.getElementById('pacienteCedula').value.trim();
    const celular = document.getElementById('pacienteCelular').value.trim();
    const direccion = document.getElementById('pacienteDireccion').value.trim();
    const seleccion = document.getElementById('pacienteEspecialidad').value;

    if (!nombre) {
      this.toast('Ingresa el nombre del paciente', 'error');
      btn.disabled = false; btn.innerText = originalText; return;
    }
    if (!seleccion) {
      this.toast('Selecciona la especialidad / área', 'error');
      btn.disabled = false; btn.innerText = originalText; return;
    }

    // Resolver la opción seleccionada → área real + motivo
    const opcion = OPCIONES_ESPECIALIDAD.find(op => op.label === seleccion);
    const especialidad = opcion ? opcion.area : seleccion;
    const motivoExtra = opcion ? opcion.motivo : null;

    try {
      if (Estado.online && sb) {
        let estadoStr = directoEspecialidad ? 'pendiente' : 'en_espera';
        let atendidoPor = directoEspecialidad ? 'Directo desde Recepción' : null;

        // Calcular el número de turno para esa especialidad SIEMPRE
        const { data: maxData } = await sb.from('pacientes_espera')
          .select('numero_turno_area')
          .eq('especialidad', especialidad)
          .not('numero_turno_area', 'is', null)
          .order('numero_turno_area', { ascending: false })
          .limit(1);

        let numTurno = 1;
        if (maxData && maxData.length > 0 && maxData[0].numero_turno_area) {
          numTurno = maxData[0].numero_turno_area + 1;
        }

        // Si hay motivo especial (ej: Solo Papanicolau), se incluye como prefijo
        // en el nombre del servicio almacenado para que el doctor lo vea en su cola
        const nombreConMotivo = motivoExtra ? `[${motivoExtra}] ${nombre}` : nombre;

        const { error } = await sb.from('pacientes_espera').insert({
          nombre: nombreConMotivo,
          cedula: cedula,
          celular: celular,
          direccion: direccion,
          especialidad: especialidad,
          numero_turno_area: numTurno,
          creado_por: Estado.userName,
          atendido_por: atendidoPor,
          estado: estadoStr
        });
        if (error) throw error;
      }

      const destino = directoEspecialidad ? `${especialidad}` : 'Signos Vitales';
      const etiqueta = motivoExtra ? `${seleccion} → ${especialidad}` : especialidad;
      this.toast(`✅ "${nombre}" → ${etiqueta}`, 'success');
      document.getElementById('pacienteNameInput').value = '';
      document.getElementById('pacienteCedula').value = '';
      document.getElementById('pacienteCelular').value = '';
      document.getElementById('pacienteDireccion').value = '';
      document.getElementById('pacienteEspecialidad').value = '';
      this.cargarHistorialTurnero();

    } catch (err) {
      console.error(err);
      this.toast('Error al registrar: ' + err.message, 'error');
    }

    btn.disabled = false;
    btn.innerText = originalText;
  },

  async cargarHistorialTurnero() {
    const lista = document.getElementById('turneroHistoryList');
    if (!lista) return;
    if (!Estado.online || !sb) return;

    try {
      const { data, error } = await sb.from('pacientes_espera')
        .select('nombre, cedula, estado, especialidad, numero_turno_area, creado_por')
        .eq('creado_por', Estado.userName)
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;

      lista.innerHTML = '';
      if (!data || data.length === 0) {
        lista.innerHTML = `
          <li>
            <div class="state-empty">
              <span class="state-empty-icon">💭</span>
              <span class="state-empty-text">No has registrado pacientes aún</span>
            </div>
          </li>`;
        return;
      }

      data.forEach(t => {
        const turnoLabel = t.numero_turno_area
          ? `<span class="badge-turno">🎫 ${t.especialidad ? t.especialidad.substring(0, 3).toUpperCase() : ''}-${t.numero_turno_area}</span>`
          : `<span class="badge-status espera">⏳ En Recepción</span>`;

        lista.innerHTML += `
          <li class="patient-item">
            <div class="patient-header">
              <div>
                <div class="patient-title">${t.nombre}</div>
                <div class="patient-subtitle">Cédula: ${t.cedula || 'N/A'}${t.especialidad ? ' &rarr; ' + t.especialidad : ''}</div>
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
  // ROL: ENFERMERA (Triaje y Signos Vitales)
  // ============================================================

  async cargarPacientesTriaje() {
    const listEl = document.getElementById('triajeList');
    if (!listEl) return;
    // Solo mostramos "Cargando..." si la lista está vacía (evita el parpadeo cuando se actualiza sola)
    if (listEl.innerHTML.trim() === '') {
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;">Cargando...</li>';
    }
    if (!Estado.online || !sb) {
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:orange;">Sin conexión a Supabase.</li>';
      return;
    }

    try {
      // La enfermera ve TODOS los que están "en_espera" (sin turno asignado aún)
      const { data, error } = await sb.from('pacientes_espera')
        .select('*')
        .eq('estado', 'en_espera')
        .order('created_at', { ascending: true });
      if (error) throw error;

      const numEl = document.getElementById('currentTriajeNumber');
      const nameEl = document.getElementById('currentTriajeName');

      let newHTML = '';

      if (!data || data.length === 0) {
        newHTML = '<li class="patient-item" style="text-align:center;color:#666;padding:1rem;">No hay pacientes en recepción.</li>';
        if (numEl) numEl.innerText = '--';
        if (nameEl) nameEl.innerText = 'Sin pacientes en espera';
      } else {
        if (numEl) numEl.innerText = data.length + ' en espera';
        if (nameEl) nameEl.innerText = 'Próximo: ' + data[0].nombre;

        data.forEach(t => {
          newHTML += `
            <li class="patient-item">
              <div class="patient-header" style="margin-bottom:0;">
                <div>
                  <div class="patient-title">${t.numero_turno_area ? `Turno ${(t.especialidad || '').substring(0, 3).toUpperCase()}-${t.numero_turno_area}` : `<span style="color:#f59e0b; font-size: 0.9rem;">Turno por asignar</span>`} — ${t.nombre}</div>
                  <div class="patient-subtitle">Cédula: ${t.cedula || 'N/A'} | Tel: ${t.celular || 'N/A'}</div>
                  <div class="patient-subtitle">Dirección: ${t.direccion || 'N/A'}</div>
                  <div class="patient-subtitle" style="margin-top:.3rem;">
                    🏥 Área: <strong style="color:var(--primary);">${t.especialidad || 'Sin asignar'}</strong>
                  </div>
                </div>
                <div class="patient-actions">
                  <button class="btn-action btn-call" onclick="app.abrirFormularioTriaje('${t.id}', '${(t.nombre || '').replace(/'/g, "\\'")}')">
                    🩺 Tomar Signos
                  </button>
                </div>
              </div>
            </li>`;
        });
      }

      if (listEl.innerHTML !== newHTML) {
        listEl.innerHTML = newHTML;
        this.filtrarTriaje();
      }

    } catch (e) {
      console.error(e);
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:red;">Error: ' + e.message + '</li>';
    }
  },

  filtrarTriaje() {
    const input = document.getElementById('inputFiltroTriaje');
    if (!input) return;
    const filter = input.value.toLowerCase();
    const items = document.querySelectorAll('#triajeList .patient-item');

    items.forEach(item => {
      // Evitar esconder los mensajes del sistema si están solos
      if (item.innerText.includes('Cargando...') || item.innerText.includes('No hay pacientes')) return;

      const text = item.innerText.toLowerCase();
      item.style.display = text.includes(filter) ? '' : 'none';
    });
  },

  abrirFormularioTriaje(pacienteId, nombrePaciente) {
    document.getElementById('triajeTurnoId').value = pacienteId;
    document.getElementById('triajePacienteName').innerText = 'Paciente: ' + nombrePaciente;
    ['triajeEdad', 'triajePeso', 'triajeEstatura', 'triajePresion',
      'triajeTemperatura', 'triajeFrecuencia', 'triajeSaturacion'
    ].forEach(id => { document.getElementById(id).value = ''; });
    this.mostrarVista('formTriaje');
  },

  async guardarTriaje() {
    const pacienteId = document.getElementById('triajeTurnoId').value;
    const btn = document.getElementById('btnGuardarTriaje');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const signosVitales = {
      edad: document.getElementById('triajeEdad').value,
      peso: document.getElementById('triajePeso').value,
      estatura: document.getElementById('triajeEstatura').value,
      presion: document.getElementById('triajePresion').value,
      temperatura: document.getElementById('triajeTemperatura').value,
      frecuencia: document.getElementById('triajeFrecuencia').value,
      saturacion: document.getElementById('triajeSaturacion').value
    };

    try {
      // Leer la especialidad que ya trae el paciente (asignada por el Turnero)
      const { data: pacData } = await sb.from('pacientes_espera')
        .select('especialidad, numero_turno_area')
        .eq('id', pacienteId)
        .single();

      const especialidad = pacData?.especialidad;
      if (!especialidad) {
        this.toast('Este paciente no tiene especialidad asignada. Contacta a recepción.', 'error');
        btn.disabled = false; btn.innerText = 'Guardar Signos Vitales';
        return;
      }

      let numTurno = pacData?.numero_turno_area;

      if (!numTurno) {
        // Calcular el siguiente número de turno para esa especialidad si es un paciente antiguo
        const { data: maxData } = await sb.from('pacientes_espera')
          .select('numero_turno_area')
          .eq('especialidad', especialidad)
          .not('numero_turno_area', 'is', null)
          .order('numero_turno_area', { ascending: false })
          .limit(1);

        numTurno = 1;
        if (maxData && maxData.length > 0 && maxData[0].numero_turno_area) {
          numTurno = maxData[0].numero_turno_area + 1;
        }
      }

      // Actualizar el registro con signos vitales y estado
      const { error } = await sb.from('pacientes_espera')
        .update({
          numero_turno_area: numTurno,
          estado: 'pendiente',
          atendido_por: Estado.userName,
          signos_vitales: JSON.stringify(signosVitales)
        })
        .eq('id', pacienteId);

      if (error) throw error;

      const prefijo = especialidad.substring(0, 3).toUpperCase();
      this.toast(`Turno ${prefijo}-${numTurno} asignado → ${especialidad}`, 'success');
      this.mostrarVista('triaje');
      this.cargarPacientesTriaje();

    } catch (e) {
      console.error(e);
      this.toast('Error al guardar: ' + e.message, 'error');
    }

    btn.disabled = false;
    btn.innerText = 'Guardar Signos Vitales';
  },

  // ============================================================
  // ROL: DOCTOR / ÁREA (ve solo su cola con turnos asignados)
  // ============================================================

  async cargarPacientesArea() {
    const listEl = document.getElementById('patientList');
    if (!listEl) return;
    // Solo mostramos "Cargando..." si la lista está vacía (evita el parpadeo)
    if (listEl.innerHTML.trim() === '') {
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;">Cargando...</li>';
    }
    if (!Estado.online || !sb) return;

    try {
      const { data: turnos, error } = await sb.from('pacientes_espera')
        .select('*')
        .eq('especialidad', Estado.areaId)
        .in('estado', ['en_espera', 'pendiente', 'en_consulta'])
        .order('created_at', { ascending: true });

      if (error) throw error;
      Estado.turnosArea = turnos; // Guardar localmente para abrir la consulta

      const numEl = document.getElementById('currentPatientNumber');
      const nameEl = document.getElementById('currentPatientName');

      let newHTML = '';

      if (!turnos || turnos.length === 0) {
        newHTML = '<li class="patient-item" style="text-align:center;color:#666;padding:1rem;">No hay pacientes en cola para esta área.</li>';
        if (numEl) numEl.innerText = '--';
        if (nameEl) nameEl.innerText = 'Cola vacía';
      } else {
        const enConsulta = turnos.find(t => t.estado === 'en_consulta');
        // El próximo a llamar debe ser el primero que esté 'pendiente', no el que está 'en_espera'
        const proximo = enConsulta || turnos.find(t => t.estado === 'pendiente') || turnos[0];

        if (numEl) numEl.innerText = proximo.numero_turno_area ? Estado.areaId.substring(0, 3).toUpperCase() + '-' + proximo.numero_turno_area : 'Por asignar';
        if (nameEl) {
          nameEl.innerText = proximo.nombre;
          if (enConsulta) nameEl.innerHTML += '<br><span style="font-size:.8rem;background:rgba(255,255,255,.25);padding:2px 10px;border-radius:12px;display:inline-block;margin-top:6px;">EN CONSULTA</span>';
        }

        turnos.forEach(t => {
          const ec = t.estado === 'en_consulta';
          const enEspera = t.estado === 'en_espera';
          let btns = '';
          if (t.estado === 'pendiente') btns = `<button class="btn-action btn-call" onclick="app.cambiarEstado('${t.id}','en_consulta')">📢 Llamar</button>`;
          if (t.estado === 'en_consulta') btns = `<button class="btn-action btn-done" onclick="app.abrirConsulta('${t.id}')" style="background:var(--success);">👨‍⚕️ Abrir Consulta</button>`;
          if (t.estado === 'en_espera') btns = `<span style="color: #f59e0b; font-weight: bold; font-size: 0.9rem; background: #fef3c7; padding: 4px 8px; border-radius: 6px;">⏳ En Signos Vitales</span>`;

          let sv = {};
          try { sv = JSON.parse(t.signos_vitales || '{}'); } catch (e) { }

          newHTML += `
            <li class="patient-item ${ec ? 'en-consulta' : ''}">
              <div class="patient-header">
                <div>
                  <div class="patient-title">${t.numero_turno_area ? `Turno ${Estado.areaId.substring(0, 3).toUpperCase()}-${t.numero_turno_area}` : `<span style="color:#f59e0b; font-size: 0.9rem;">Turno por asignar</span>`} — ${t.nombre}</div>
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
      }

      if (listEl.innerHTML !== newHTML) {
        listEl.innerHTML = newHTML;
        this.filtrarDoctor();
      }
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
    await this.cargarPacientesArea();
  },

  filtrarDoctor() {
    const input = document.getElementById('inputFiltroDoctor');
    if (!input) return;
    const filter = input.value.toLowerCase();
    const items = document.querySelectorAll('#patientList .patient-item');

    items.forEach(item => {
      if (item.innerText.includes('Cargando...') || item.innerText.includes('No hay pacientes')) return;
      const text = item.innerText.toLowerCase();
      item.style.display = text.includes(filter) ? '' : 'none';
    });
  },

  abrirConsulta(pacienteId) {
    if (!Estado.turnosArea) return;
    const paciente = Estado.turnosArea.find(p => p.id === pacienteId);
    if (!paciente) return;

    // Reset visual state
    const formContent = document.getElementById('formConsultaContent');
    const successScreen = document.getElementById('formConsultaSuccess');
    if (formContent) formContent.style.display = 'block';
    if (successScreen) successScreen.style.display = 'none';

    document.getElementById('consultaTurnoId').value = paciente.id;
    document.getElementById('consultaPacienteName').innerText = 'Paciente: ' + paciente.nombre;

    document.getElementById('consNombre').value = paciente.nombre || '';
    document.getElementById('consCedula').value = paciente.cedula || '';
    document.getElementById('consCelular').value = paciente.celular || '';
    document.getElementById('consDireccion').value = paciente.direccion || '';

    let sv = {};
    try { sv = JSON.parse(paciente.signos_vitales || '{}'); } catch (e) { }

    document.getElementById('consEdad').value = sv.edad || '';
    document.getElementById('consPeso').value = sv.peso || '';
    document.getElementById('consEstatura').value = sv.estatura || '';
    document.getElementById('consPresion').value = sv.presion || '';
    document.getElementById('consTemperatura').value = sv.temperatura || '';
    document.getElementById('consFrecuencia').value = sv.frecuencia || '';
    document.getElementById('consSaturacion').value = sv.saturacion || '';

    document.getElementById('consDiagnostico').value = sv.diagnostico || '';
    document.getElementById('consReceta').value = sv.receta || '';

    this.mostrarVista('formConsulta');
  },

  async guardarConsulta() {
    const pacienteId = document.getElementById('consultaTurnoId').value;
    const btn = document.getElementById('btnGuardarConsulta');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const paciente = Estado.turnosArea.find(p => p.id === pacienteId);
    if (!paciente) {
      this.toast('Error: Paciente no encontrado', 'error');
      btn.disabled = false; btn.innerText = '✅ Finalizar Consulta';
      return;
    }

    let sv = {};
    try { sv = JSON.parse(paciente.signos_vitales || '{}'); } catch (e) { }

    sv.edad = document.getElementById('consEdad').value;
    sv.peso = document.getElementById('consPeso').value;
    sv.estatura = document.getElementById('consEstatura').value;
    sv.presion = document.getElementById('consPresion').value;
    sv.temperatura = document.getElementById('consTemperatura').value;
    sv.frecuencia = document.getElementById('consFrecuencia').value;
    sv.saturacion = document.getElementById('consSaturacion').value;

    sv.diagnostico = document.getElementById('consDiagnostico').value.trim();
    const recetaTexto = document.getElementById('consReceta').value.trim();

    let codigoReceta = null;
    if (recetaTexto) {
      // Generar código único de receta de SOLO 4 NÚMEROS (Ej: 4921)
      codigoReceta = Math.floor(1000 + Math.random() * 9000).toString();
      sv.receta = recetaTexto;
      sv.codigo_receta = codigoReceta;
    }

    try {
      // 1. Actualizar paciente actual y marcarlo como atendido
      const nombreFinal = document.getElementById('consNombre').value.trim();
      const cedulaFinal = document.getElementById('consCedula').value.trim();
      const celularFinal = document.getElementById('consCelular').value.trim();
      const direccionFinal = document.getElementById('consDireccion').value.trim();

      const { error: err1 } = await sb.from('pacientes_espera')
        .update({
          estado: 'atendido',
          nombre: nombreFinal,
          cedula: cedulaFinal,
          celular: celularFinal,
          direccion: direccionFinal,
          signos_vitales: JSON.stringify(sv)
        })
        .eq('id', pacienteId);
      if (err1) throw err1;

      // 2. Si hay receta, enviar a Farmacia creando un nuevo turno
      if (recetaTexto) {

        // Calcular turno de farmacia
        const { data: maxData } = await sb.from('pacientes_espera')
          .select('numero_turno_area')
          .eq('especialidad', 'Farmacia')
          .not('numero_turno_area', 'is', null)
          .order('numero_turno_area', { ascending: false })
          .limit(1);

        let numTurnoFarmacia = 1;
        if (maxData && maxData.length > 0 && maxData[0].numero_turno_area) {
          numTurnoFarmacia = maxData[0].numero_turno_area + 1;
        }

        const { error: err2 } = await sb.from('pacientes_espera').insert({
          nombre: `[Receta: ${codigoReceta}] ${nombreFinal}`,
          cedula: cedulaFinal,
          celular: celularFinal,
          direccion: direccionFinal,
          especialidad: 'Farmacia',
          numero_turno_area: numTurnoFarmacia,
          creado_por: Estado.userName,
          atendido_por: 'Enviado desde ' + Estado.areaId,
          estado: 'pendiente', // Aparece directo en la lista de Farmacia
          signos_vitales: JSON.stringify(sv)
        });
        if (err2) throw err2;

        // Mostrar pantalla de éxito con el código (no cerramos la vista aún)
        const formContent = document.getElementById('formConsultaContent');
        const successScreen = document.getElementById('formConsultaSuccess');
        const codeDisplay = document.getElementById('consultaCodigoGenerado');

        if (formContent && successScreen && codeDisplay) {
          formContent.style.display = 'none';
          codeDisplay.innerText = codigoReceta;
          successScreen.style.display = 'block';
        } else {
          this.toast(`✅ Consulta finalizada. Receta ${codigoReceta} enviada a Farmacia.`, 'success');
          this.mostrarVista('misPacientes');
        }
      } else {
        this.toast('✅ Consulta finalizada exitosamente.', 'success');
        this.mostrarVista('misPacientes');
      }

      await this.cargarPacientesArea();
    } catch (e) {
      console.error(e);
      this.toast('Error: ' + e.message, 'error');
    }

    btn.disabled = false;
    btn.innerText = '✅ Finalizar Consulta';
  },

  cerrarPantallaExitoConsulta() {
    this.mostrarVista('misPacientes');
  },

  // ---- EXPORTAR EXCEL ----
  async descargarExcel() {
    if (!Estado.online || !sb) {
      this.toast('Sin conexión a base de datos', 'error');
      return;
    }

    this.toast('Generando archivo Excel (CSV)...', 'success');

    try {
      const { data, error } = await sb.from('pacientes_espera')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        this.toast('No hay datos para exportar', 'error');
        return;
      }

      // Crear encabezados CSV
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Fecha,Nombre,Cedula,Celular,Direccion,Especialidad,Turno,Estado,Creado Por,Atendido Por,Edad,Peso,Estatura,Presion,Temperatura,Frecuencia,Saturacion\n";

      data.forEach(t => {
        let sv = {};
        try { sv = JSON.parse(t.signos_vitales || '{}'); } catch (e) { }

        const fechaStr = t.created_at ? new Date(t.created_at).toLocaleString() : '';
        const turnoStr = t.numero_turno_area ? `${(t.especialidad || '').substring(0, 3).toUpperCase()}-${t.numero_turno_area}` : 'N/A';

        const row = [
          `"${fechaStr}"`,
          `"${t.nombre || ''}"`,
          `"${t.cedula || ''}"`,
          `"${t.celular || ''}"`,
          `"${t.direccion || ''}"`,
          `"${t.especialidad || ''}"`,
          `"${turnoStr}"`,
          `"${t.estado || ''}"`,
          `"${t.creado_por || ''}"`,
          `"${t.atendido_por || ''}"`,
          `"${sv.edad || ''}"`,
          `"${sv.peso || ''}"`,
          `"${sv.estatura || ''}"`,
          `"${sv.presion || ''}"`,
          `"${sv.temperatura || ''}"`,
          `"${sv.frecuencia || ''}"`,
          `"${sv.saturacion || ''}"`
        ];

        csvContent += row.join(",") + "\n";
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Reporte_Pacientes_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.toast('Excel descargado correctamente', 'success');

    } catch (error) {
      console.error(error);
      this.toast('Error al exportar: ' + error.message, 'error');
    }
  },

  // ============================================================
  // ROL: ADMIN (Panel de Control de Usuarios)
  // ============================================================

  async adminCargarUsuarios() {
    const listEl = document.getElementById('adminUserList');
    if (!listEl) return;
    listEl.innerHTML = `
      <li>
        <div class="state-empty animate-pulse">
          <span class="state-empty-icon">👤</span>
          <span class="state-empty-text">Cargando usuarios...</span>
        </div>
      </li>`;

    try {
      const { data, error } = await sb.rpc('admin_obtener_usuarios', {
        p_admin_user: Estado.userName,
        p_admin_pass: Estado.adminPass
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      listEl.innerHTML = '';
      const usuarios = data.data || [];
      if (usuarios.length === 0) {
        listEl.innerHTML = `
          <li>
            <div class="state-empty">
              <span class="state-empty-icon">👥</span>
              <span class="state-empty-text">No hay usuarios registrados</span>
            </div>
          </li>`;
        return;
      }

      usuarios.forEach(u => {
        const roleClass = u.role === 'admin' ? 'admin' : (u.role === 'doctor' ? 'doctor' : (u.role === 'enfermera' ? 'enfermera' : 'turnero'));
        listEl.innerHTML += `
          <li class="admin-user-item">
            <div class="admin-user-info">
              <div class="admin-username">@${u.username}${u.username === Estado.userName ? ' <span style="color:#a0aec0;font-size:0.78rem;font-weight:500;">(tú)</span>' : ''}</div>
              <div class="admin-user-meta">
                <span class="role-badge ${roleClass}">${u.role.toUpperCase()}</span>
                ${u.area ? `<span class="area-tag">🏥 ${u.area}</span>` : ''}
              </div>
            </div>
            ${u.username !== Estado.userName
            ? `<button class="btn-action" style="background:var(--danger);" onclick="app.adminEliminarUsuario('${u.id}', '${u.username}')">🗑️ Eliminar</button>`
            : ''}
          </li>`;
      });
    } catch (e) {
      console.error(e);
      listEl.innerHTML = `<li><div class="state-empty"><span class="state-empty-icon">❌</span><span class="state-empty-text">Error: ${e.message}</span></div></li>`;
    }
  },

  async adminCrearUsuario() {
    const username = (document.getElementById('adminNewUser').value || '').trim();
    const pass = (document.getElementById('adminNewPass').value || '').trim();
    const role = document.getElementById('adminNewRole').value;
    const area = (document.getElementById('adminNewArea').value || '').trim();

    if (!username || !pass) {
      this.toast('Por favor completa usuario y contraseña', 'error');
      return;
    }
    if (role === 'doctor' && !area) {
      this.toast('El doctor debe tener un área especificada', 'error');
      return;
    }

    try {
      const { data, error } = await sb.rpc('admin_crear_usuario', {
        p_admin_user: Estado.userName,
        p_admin_pass: Estado.adminPass,
        p_new_username: username,
        p_new_password: pass,
        p_new_role: role,
        p_new_area: role === 'doctor' ? area : null
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      this.toast(`Usuario @${username} creado exitosamente`, 'success');
      document.getElementById('adminNewUser').value = '';
      document.getElementById('adminNewPass').value = '';
      if (role === 'doctor') document.getElementById('adminNewArea').value = '';

      this.adminCargarUsuarios();
    } catch (e) {
      console.error(e);
      this.toast('Error: ' + e.message, 'error');
    }
  },

  async adminEliminarUsuario(id, username) {
    if (!confirm(`¿Estás seguro de que deseas ELIMINAR el usuario @${username}?`)) return;

    try {
      const { data, error } = await sb.rpc('admin_eliminar_usuario', {
        p_admin_user: Estado.userName,
        p_admin_pass: Estado.adminPass,
        p_target_id: id
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      this.toast(`Usuario @${username} eliminado`, 'success');
      this.adminCargarUsuarios();
    } catch (e) {
      console.error(e);
      this.toast('Error al eliminar: ' + e.message, 'error');
    }
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
